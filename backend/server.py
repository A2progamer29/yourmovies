from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Header, Query, Request, Response, status
from fastapi.responses import Response as FastAPIResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import io
import requests
import bcrypt
import jwt as pyjwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------- Config ----------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGO = 'HS256'
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
APP_NAME = os.environ.get('APP_NAME', 'yourmovies')
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

# ---------- DB ----------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ---------- App ----------
app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------- Storage (Cloudinary) ----------
import cloudinary
import cloudinary.uploader
# Le SDK se configure automatiquement via la variable d'env CLOUDINARY_URL
# (format: cloudinary://api_key:api_secret@cloud_name)
CLOUDINARY_CONFIGURED = bool(os.environ.get("CLOUDINARY_URL"))
if CLOUDINARY_CONFIGURED:
    cloudinary.config(secure=True)

# ---------- Bunny Stream (hébergement des grosses vidéos) ----------
BUNNY_LIBRARY_ID = os.environ.get("BUNNY_LIBRARY_ID")
BUNNY_API_KEY = os.environ.get("BUNNY_API_KEY")
BUNNY_CDN_HOST = os.environ.get("BUNNY_CDN_HOST")
BUNNY_CONFIGURED = bool(BUNNY_LIBRARY_ID and BUNNY_API_KEY)

# ---------- Models ----------
class UserPublic(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    is_admin: bool = False
    auth_provider: str = "jwt"
    premium: bool = False
    premium_plan: Optional[str] = None
    premium_until: Optional[str] = None
    bio: Optional[str] = None
    preferred_quality: Optional[str] = None  # user's default choice ("4k","1080p","720p","auto")
    autoplay_hero: bool = True
    accent_color: Optional[str] = None
    has_pin: bool = False

class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginInput(BaseModel):
    email: EmailStr
    password: str

class SessionExchangeInput(BaseModel):
    session_id: str

class MediaBase(BaseModel):
    title: str
    description: str = ""
    type: Literal["movie", "series", "anime"]
    year: Optional[int] = None
    duration_minutes: Optional[int] = None
    genres: List[str] = []
    poster_url: Optional[str] = None
    banner_url: Optional[str] = None
    title_logo_url: Optional[str] = None  # PNG logo of the title (overlays hero)
    age_rating: Optional[str] = None  # "G", "PG", "PG-13", "R", "18+", or numeric min age as string
    trailer_youtube_id: Optional[str] = None
    trailer_video_url: Optional[str] = None  # fichier vidéo uploadé pour la bande-annonce
    video_file_path: Optional[str] = None
    video_url: Optional[str] = None  # external MP4/HLS URL alternative to upload
    bunny_video_id: Optional[str] = None  # vidéo hébergée sur Bunny Stream
    qualities: List[dict] = []  # [{quality: "720p"|"1080p"|"4k", url: "https://...", file_path: "..."}]
    cast: List[str] = []
    director: Optional[str] = None
    country: Optional[str] = None
    rating: Optional[float] = None
    seasons: List[dict] = []
    featured: bool = False
    featured_order: Optional[int] = None

class MediaUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[Literal["movie", "series", "anime"]] = None
    year: Optional[int] = None
    duration_minutes: Optional[int] = None
    genres: Optional[List[str]] = None
    poster_url: Optional[str] = None
    banner_url: Optional[str] = None
    title_logo_url: Optional[str] = None
    age_rating: Optional[str] = None
    trailer_youtube_id: Optional[str] = None
    trailer_video_url: Optional[str] = None
    video_file_path: Optional[str] = None
    video_url: Optional[str] = None
    bunny_video_id: Optional[str] = None
    qualities: Optional[List[dict]] = None
    cast: Optional[List[str]] = None
    director: Optional[str] = None
    country: Optional[str] = None
    rating: Optional[float] = None
    seasons: Optional[List[dict]] = None
    featured: Optional[bool] = None
    featured_order: Optional[int] = None

class MediaCreate(MediaBase):
    pass

class MediaOut(MediaBase):
    id: str
    created_at: str

class ReviewCreate(BaseModel):
    media_id: str
    rating: float = Field(..., ge=0, le=10)
    comment: str = ""

class ReviewOut(BaseModel):
    id: str
    media_id: str
    user_id: str
    user_name: str
    rating: float
    comment: str
    created_at: str

# ---------- Auth Helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_jwt(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def get_user_by_id(user_id: str) -> Optional[dict]:
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})

async def get_current_user(request: Request, authorization: Optional[str] = Header(None)) -> dict:
    # Try JWT via Authorization header
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    # Try Emergent session token cookie
    session_token = request.cookies.get("session_token")

    if token:
        try:
            payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
            user_id = payload.get("user_id")
            user = await get_user_by_id(user_id)
            if user:
                return user
        except Exception:
            pass  # fall through, try session_token

    if session_token:
        session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if session:
            exp = session.get("expires_at")
            if isinstance(exp, str):
                exp = datetime.fromisoformat(exp)
            if exp and exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp and exp > datetime.now(timezone.utc):
                user = await get_user_by_id(session["user_id"])
                if user:
                    return user

    raise HTTPException(status_code=401, detail="Not authenticated")

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    return user

async def get_optional_user(request: Request, authorization: Optional[str] = Header(None)) -> Optional[dict]:
    try:
        return await get_current_user(request, authorization)
    except HTTPException:
        return None

def user_public_dict(user: dict) -> dict:
    premium_until = user.get("premium_until")
    premium_active = False
    if premium_until:
        try:
            dt = datetime.fromisoformat(premium_until) if isinstance(premium_until, str) else premium_until
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            premium_active = dt > datetime.now(timezone.utc)
        except Exception:
            premium_active = False
    return {
        "user_id": user.get("user_id"),
        "email": user.get("email"),
        "name": user.get("name"),
        "picture": user.get("picture"),
        "is_admin": bool(user.get("is_admin")),
        "auth_provider": user.get("auth_provider", "jwt"),
        "premium": premium_active,
        "premium_plan": user.get("premium_plan") if premium_active else None,
        "premium_until": premium_until if premium_active else None,
        "bio": user.get("bio"),
        "preferred_quality": user.get("preferred_quality"),
        "autoplay_hero": user.get("autoplay_hero", True),
        "accent_color": user.get("accent_color") if premium_active else None,
        "has_pin": bool(user.get("pin_hash")),
    }

# ---------- Auth Routes ----------
@api_router.post("/auth/register")
async def register(inp: RegisterInput):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    is_admin = await db.users.count_documents({}) == 0  # first user becomes admin
    doc = {
        "user_id": user_id,
        "email": inp.email.lower(),
        "name": inp.name,
        "password_hash": hash_password(inp.password),
        "picture": None,
        "is_admin": is_admin,
        "auth_provider": "jwt",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_jwt(user_id)
    return {"token": token, "user": user_public_dict(doc)}

@api_router.post("/auth/login")
async def login(inp: LoginInput):
    user = await db.users.find_one({"email": inp.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(inp.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_jwt(user["user_id"])
    return {"token": token, "user": user_public_dict(user)}

class GoogleAuthInput(BaseModel):
    credential: str

@api_router.post("/auth/google")
async def auth_google(inp: GoogleAuthInput):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google login not configured")
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        idinfo = google_id_token.verify_oauth2_token(
            inp.credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except Exception as e:
        logger.error(f"Google token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Google token")

    email = (idinfo.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google account has no email")
    name = idinfo.get("name") or email.split("@")[0]
    picture = idinfo.get("picture")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        is_admin = await db.users.count_documents({}) == 0
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "is_admin": is_admin,
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    user = await get_user_by_id(user_id)
    token = create_jwt(user_id)
    return {"token": token, "user": user_public_dict(user)}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_public_dict(user)

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# ---------- Media Routes ----------
def serialize_media(doc) -> dict:
    return {
        "id": doc["id"],
        "title": doc.get("title", ""),
        "description": doc.get("description", ""),
        "type": doc.get("type", "movie"),
        "year": doc.get("year"),
        "duration_minutes": doc.get("duration_minutes"),
        "genres": doc.get("genres", []),
        "poster_url": doc.get("poster_url"),
        "banner_url": doc.get("banner_url"),
        "trailer_youtube_id": doc.get("trailer_youtube_id"),
        "trailer_video_url": doc.get("trailer_video_url"),
        "video_file_path": doc.get("video_file_path"),
        "video_url": doc.get("video_url"),
        "bunny_video_id": doc.get("bunny_video_id"),
        "qualities": doc.get("qualities", []),
        "title_logo_url": doc.get("title_logo_url"),
        "age_rating": doc.get("age_rating"),
        "cast": doc.get("cast", []),
        "director": doc.get("director"),
        "country": doc.get("country"),
        "rating": doc.get("rating"),
        "seasons": doc.get("seasons", []),
        "featured": doc.get("featured", False),
        "featured_order": doc.get("featured_order"),
        "created_at": doc.get("created_at", ""),
    }

@api_router.get("/media")
async def list_media(type: Optional[str] = None, q: Optional[str] = None, featured: Optional[bool] = None, limit: int = 100):
    query = {}
    if type:
        query["type"] = type
    if q:
        query["title"] = {"$regex": q, "$options": "i"}
    if featured is not None:
        query["featured"] = featured
    docs = await db.media.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [serialize_media(d) for d in docs]

@api_router.get("/media/{media_id}")
async def get_media(media_id: str):
    doc = await db.media.find_one({"id": media_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return serialize_media(doc)

@api_router.post("/media")
async def create_media(m: MediaCreate, user: dict = Depends(require_admin)):
    media_id = f"m_{uuid.uuid4().hex[:12]}"
    doc = m.model_dump()
    doc["id"] = media_id
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.media.insert_one(doc)
    return serialize_media(doc)

@api_router.put("/media/{media_id}")
async def update_media(media_id: str, m: MediaUpdate, user: dict = Depends(require_admin)):
    doc = {k: v for k, v in m.model_dump(exclude_unset=True).items()}
    if not doc:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.media.update_one({"id": media_id}, {"$set": doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    fresh = await db.media.find_one({"id": media_id}, {"_id": 0})
    return serialize_media(fresh)

@api_router.delete("/media/{media_id}")
async def delete_media(media_id: str, user: dict = Depends(require_admin)):
    await db.media.delete_one({"id": media_id})
    await db.reviews.delete_many({"media_id": media_id})
    await db.favorites.delete_many({"media_id": media_id})
    return {"ok": True}

# ---------- Reviews ----------
@api_router.get("/media/{media_id}/reviews")
async def list_reviews(media_id: str):
    docs = await db.reviews.find({"media_id": media_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs

@api_router.post("/reviews")
async def create_review(r: ReviewCreate, user: dict = Depends(get_current_user)):
    review_id = f"r_{uuid.uuid4().hex[:12]}"
    # replace existing review by same user for this media
    await db.reviews.delete_many({"media_id": r.media_id, "user_id": user["user_id"]})
    doc = {
        "id": review_id,
        "media_id": r.media_id,
        "user_id": user["user_id"],
        "user_name": user.get("name", "User"),
        "rating": r.rating,
        "comment": r.comment,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one(doc)
    # Recompute average rating for media
    pipeline = [{"$match": {"media_id": r.media_id}}, {"$group": {"_id": None, "avg": {"$avg": "$rating"}}}]
    agg = await db.reviews.aggregate(pipeline).to_list(1)
    avg = agg[0]["avg"] if agg else None
    await db.media.update_one({"id": r.media_id}, {"$set": {"rating": round(avg, 1) if avg else None}})
    # Return a clean dict (drop MongoDB _id if inserted)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.delete("/reviews/{review_id}")
async def delete_review(review_id: str, user: dict = Depends(get_current_user)):
    doc = await db.reviews.find_one({"id": review_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if doc["user_id"] != user["user_id"] and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.reviews.delete_one({"id": review_id})
    return {"ok": True}

# ---------- Favorites / Watchlist ----------
@api_router.get("/favorites")
async def list_favorites(user: dict = Depends(get_current_user)):
    favs = await db.favorites.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    media_ids = [f["media_id"] for f in favs]
    docs = await db.media.find({"id": {"$in": media_ids}}, {"_id": 0}).to_list(500)
    ordered = {d["id"]: d for d in docs}
    result = []
    for f in favs:
        d = ordered.get(f["media_id"])
        if d:
            m = serialize_media(d)
            m["list_type"] = f.get("list_type", "favorite")
            result.append(m)
    return result

@api_router.post("/favorites/{media_id}")
async def toggle_favorite(media_id: str, list_type: str = Query("favorite"), user: dict = Depends(get_current_user)):
    existing = await db.favorites.find_one({"user_id": user["user_id"], "media_id": media_id, "list_type": list_type})
    if existing:
        await db.favorites.delete_one({"user_id": user["user_id"], "media_id": media_id, "list_type": list_type})
        return {"active": False}
    await db.favorites.insert_one({
        "user_id": user["user_id"],
        "media_id": media_id,
        "list_type": list_type,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"active": True}

@api_router.get("/favorites/status/{media_id}")
async def favorite_status(media_id: str, user: dict = Depends(get_current_user)):
    fav = await db.favorites.find_one({"user_id": user["user_id"], "media_id": media_id, "list_type": "favorite"})
    watch = await db.favorites.find_one({"user_id": user["user_id"], "media_id": media_id, "list_type": "watchlist"})
    return {"favorite": bool(fav), "watchlist": bool(watch)}

# ---------- Upload / File ----------
@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), kind: str = Form("image"), user: dict = Depends(get_current_user)):
    if kind == "video" and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    if not CLOUDINARY_CONFIGURED:
        raise HTTPException(status_code=500, detail="Stockage non configuré (CLOUDINARY_URL manquant)")
    data = await file.read()
    resource_type = "video" if kind == "video" else "image"
    try:
        result = cloudinary.uploader.upload(
            data,
            folder=f"{APP_NAME}/{kind}",
            resource_type=resource_type,
        )
    except Exception as e:
        logger.error(f"Cloudinary upload failed: {e}")
        raise HTTPException(status_code=500, detail="Téléversement impossible")
    url = result.get("secure_url")
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": result.get("public_id"),
        "url": url,
        "original_filename": file.filename,
        "kind": kind,
        "uploaded_by": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"path": result.get("public_id"), "url": url, "size": result.get("bytes", len(data)), "content_type": file.content_type}

@api_router.post("/upload/sign")
async def upload_sign(kind: str = Form("image"), user: dict = Depends(get_current_user)):
    if kind == "video" and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    if not CLOUDINARY_CONFIGURED:
        raise HTTPException(status_code=500, detail="Stockage non configuré")
    import time
    import cloudinary.utils
    cfg = cloudinary.config()
    timestamp = int(time.time())
    folder = f"{APP_NAME}/{kind}"
    signature = cloudinary.utils.api_sign_request({"timestamp": timestamp, "folder": folder}, cfg.api_secret)
    return {
        "signature": signature,
        "timestamp": timestamp,
        "api_key": cfg.api_key,
        "cloud_name": cfg.cloud_name,
        "folder": folder,
        "resource_type": "video" if kind == "video" else "image",
    }

@api_router.post("/bunny/create-video")
async def bunny_create_video(title: str = Form("video"), user: dict = Depends(require_admin)):
    if not BUNNY_CONFIGURED:
        raise HTTPException(status_code=500, detail="Bunny Stream non configuré")
    import hashlib, time
    r = requests.post(
        f"https://video.bunnycdn.com/library/{BUNNY_LIBRARY_ID}/videos",
        headers={"AccessKey": BUNNY_API_KEY, "Content-Type": "application/json"},
        json={"title": title}, timeout=30,
    )
    if not r.ok:
        logger.error(f"Bunny create video failed: {r.status_code} {r.text[:200]}")
        raise HTTPException(status_code=500, detail="Création vidéo Bunny impossible")
    video_id = r.json().get("guid")
    expire = int(time.time()) + 3600
    signature = hashlib.sha256(f"{BUNNY_LIBRARY_ID}{BUNNY_API_KEY}{expire}{video_id}".encode()).hexdigest()
    return {"videoId": video_id, "libraryId": str(BUNNY_LIBRARY_ID), "signature": signature, "expire": expire}

@api_router.get("/bunny/video-status/{video_id}")
async def bunny_video_status(video_id: str):
    if not BUNNY_CONFIGURED:
        raise HTTPException(status_code=500, detail="Bunny Stream non configuré")
    r = requests.get(
        f"https://video.bunnycdn.com/library/{BUNNY_LIBRARY_ID}/videos/{video_id}",
        headers={"AccessKey": BUNNY_API_KEY}, timeout=15,
    )
    if not r.ok:
        raise HTTPException(status_code=500, detail="Statut vidéo indisponible")
    j = r.json()
    return {"status": j.get("status"), "encodeProgress": j.get("encodeProgress", 0), "availableResolutions": j.get("availableResolutions")}

# ---------- Plans / Stripe ----------
import stripe

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

PLANS = [
    {
        "id": "basic",
        "name": "Basic",
        "tagline": "Découvrez l'essentiel",
        "features": [
            "Accès complet au catalogue",
            "1 écran simultané",
            "Sans publicité",
        ],
        "prices": {
            "monthly": {"lookup_key": "ym_basic_monthly", "amount": 4.99, "currency": "eur"},
            "yearly": {"lookup_key": "ym_basic_yearly", "amount": 47.88, "currency": "eur"},
        },
    },
    {
        "id": "standard",
        "name": "Standard",
        "tagline": "Le choix des cinéphiles",
        "features": [
            "Accès complet au catalogue",
            "2 écrans simultanés",
            "Sans publicité",
            "Téléchargements hors-ligne (à venir)",
        ],
        "prices": {
            "monthly": {"lookup_key": "ym_standard_monthly", "amount": 9.99, "currency": "eur"},
            "yearly": {"lookup_key": "ym_standard_yearly", "amount": 95.88, "currency": "eur"},
        },
    },
    {
        "id": "premium",
        "name": "Premium",
        "tagline": "L'expérience ultime",
        "features": [
            "Accès complet + accès anticipé",
            "4 écrans simultanés",
            "Sans publicité",
            "Bande-annonce cinéma sur l'accueil",
            "Téléchargements hors-ligne (à venir)",
        ],
        "prices": {
            "monthly": {"lookup_key": "ym_premium_monthly", "amount": 16.99, "currency": "eur"},
            "yearly": {"lookup_key": "ym_premium_yearly", "amount": 163.08, "currency": "eur"},
        },
    },
]

@api_router.get("/plans")
async def list_plans():
    return PLANS

class CheckoutRequest(BaseModel):
    lookup_key: str
    origin_url: str

@api_router.post("/payments/checkout")
async def create_checkout(req: CheckoutRequest, user: dict = Depends(get_current_user)):
    try:
        prices = stripe.Price.list(lookup_keys=[req.lookup_key], active=True, limit=1).data
        if not prices:
            raise HTTPException(status_code=400, detail=f"Price not found: {req.lookup_key}")
        price = prices[0]
        kwargs = dict(
            line_items=[{"price": price.id, "quantity": 1}],
            mode="subscription" if price.recurring else "payment",
            success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{req.origin_url}/pricing",
            metadata={"user_id": user["user_id"], "lookup_key": req.lookup_key},
        )
        # Digital subscription, US-based sandbox → SMP eligible
        try:
            session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
        except stripe.error.InvalidRequestError as e:
            msg = (getattr(e, "user_message", "") or "").lower()
            if "managed payments" in msg or "ineligible" in msg:
                session = stripe.checkout.Session.create(
                    **kwargs, automatic_tax={"enabled": True}, billing_address_collection="required",
                )
            else:
                raise
        await db.payment_transactions.insert_one({
            "session_id": session.id,
            "user_id": user["user_id"],
            "lookup_key": req.lookup_key,
            "amount": (price.unit_amount or 0),
            "currency": price.currency,
            "status": "initiated",
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"checkout_url": session.url, "session_id": session.id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Checkout failed: {e}")
        raise HTTPException(status_code=500, detail="Payment initialization failed")

async def _apply_paid_subscription(session_id: str, user_id: Optional[str] = None, lookup_key: Optional[str] = None, subscription_id: Optional[str] = None):
    if not user_id or not lookup_key:
        tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        if tx:
            user_id = user_id or tx.get("user_id")
            lookup_key = lookup_key or tx.get("lookup_key")
    if not user_id or not lookup_key:
        return
    # Determine plan_id and interval from lookup_key
    plan_id = lookup_key.replace("ym_", "").split("_")[0]  # basic/standard/premium
    interval = "yearly" if lookup_key.endswith("_yearly") else "monthly"
    days = 365 if interval == "yearly" else 31
    premium_until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    await db.users.update_one({"user_id": user_id}, {"$set": {
        "premium_plan": plan_id,
        "premium_until": premium_until,
        "premium_interval": interval,
        "stripe_subscription_id": subscription_id,
    }})

@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {
                        "status": "completed",
                        "payment_status": "paid",
                        "stripe_subscription_id": s.subscription,
                        "stripe_payment_intent_id": s.payment_intent,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
                await _apply_paid_subscription(session_id, subscription_id=s.subscription)
                record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        except stripe.error.StripeError:
            pass
    return {"session_id": record["session_id"], "status": record["status"], "payment_status": record["payment_status"]}

@api_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj = event["data"]["object"]
    t = event["type"]
    if t == "checkout.session.completed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {
                "status": "completed",
                "payment_status": obj.get("payment_status", "paid"),
                "stripe_subscription_id": obj.get("subscription"),
                "stripe_payment_intent_id": obj.get("payment_intent"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        await _apply_paid_subscription(obj["id"], subscription_id=obj.get("subscription"))
    elif t == "checkout.session.async_payment_succeeded":
        await db.payment_transactions.update_one({"session_id": obj["id"]},
            {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc).isoformat()}})
        await _apply_paid_subscription(obj["id"])
    elif t == "checkout.session.async_payment_failed":
        await db.payment_transactions.update_one({"session_id": obj["id"]},
            {"$set": {"status": "failed", "payment_status": "failed", "updated_at": datetime.now(timezone.utc).isoformat()}})
    elif t == "checkout.session.expired":
        await db.payment_transactions.update_one({"session_id": obj["id"]},
            {"$set": {"status": "expired", "payment_status": "expired", "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"status": "ok"}

# ---------- Watch Progress ----------
class WatchProgressInput(BaseModel):
    media_id: str
    position_seconds: float
    duration_seconds: Optional[float] = None

@api_router.post("/watch-progress")
async def save_progress(inp: WatchProgressInput, user: dict = Depends(get_current_user)):
    await db.watch_progress.update_one(
        {"user_id": user["user_id"], "media_id": inp.media_id},
        {"$set": {
            "user_id": user["user_id"],
            "media_id": inp.media_id,
            "position_seconds": inp.position_seconds,
            "duration_seconds": inp.duration_seconds,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}

@api_router.get("/watch-progress")
async def list_progress(user: dict = Depends(get_current_user)):
    docs = await db.watch_progress.find({"user_id": user["user_id"]}, {"_id": 0}).sort("updated_at", -1).to_list(50)
    media_ids = [d["media_id"] for d in docs]
    media_docs = await db.media.find({"id": {"$in": media_ids}}, {"_id": 0}).to_list(50)
    media_map = {m["id"]: m for m in media_docs}
    result = []
    for d in docs:
        m = media_map.get(d["media_id"])
        if not m:
            continue
        item = serialize_media(m)
        item["position_seconds"] = d["position_seconds"]
        item["duration_seconds"] = d.get("duration_seconds")
        item["updated_at"] = d.get("updated_at")
        result.append(item)
    return result

# ---------- Similar ----------
@api_router.get("/media/{media_id}/similar")
async def similar_media(media_id: str, limit: int = 8):
    m = await db.media.find_one({"id": media_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    genres = m.get("genres", []) or []
    mtype = m.get("type")
    # Fetch candidates by same type OR overlapping genres
    query = {"id": {"$ne": media_id}}
    if genres:
        query["$or"] = [{"type": mtype}, {"genres": {"$in": genres}}]
    else:
        query["type"] = mtype
    cands = await db.media.find(query, {"_id": 0}).to_list(50)
    def score(c):
        c_genres = set(c.get("genres", []) or [])
        overlap = len(c_genres & set(genres))
        same_type = 1 if c.get("type") == mtype else 0
        rating_boost = (c.get("rating") or 0) / 20
        return overlap * 2 + same_type + rating_boost
    cands.sort(key=score, reverse=True)
    return [serialize_media(c) for c in cands[:limit]]

# ---------- Subscription Management ----------
@api_router.get("/subscription/current")
async def current_subscription(user: dict = Depends(get_current_user)):
    sub_id = user.get("stripe_subscription_id")
    plan = user.get("premium_plan")
    premium_until = user.get("premium_until")
    interval = user.get("premium_interval")
    result = {
        "plan": plan,
        "interval": interval,
        "premium_until": premium_until,
        "cancel_at_period_end": False,
        "next_billing_date": None,
        "amount": None,
        "currency": None,
        "status": None,
        "stripe_subscription_id": sub_id,
    }
    if sub_id:
        try:
            sub = stripe.Subscription.retrieve(sub_id)
            result["cancel_at_period_end"] = bool(sub.cancel_at_period_end)
            if sub.current_period_end:
                result["next_billing_date"] = datetime.fromtimestamp(sub.current_period_end, tz=timezone.utc).isoformat()
            result["status"] = sub.status
            if sub["items"] and sub["items"]["data"]:
                price = sub["items"]["data"][0]["price"]
                result["amount"] = price.get("unit_amount")
                result["currency"] = price.get("currency")
        except Exception as e:
            logger.error(f"Fetch subscription failed: {e}")
    return result

@api_router.post("/subscription/cancel")
async def cancel_subscription(user: dict = Depends(get_current_user)):
    sub_id = user.get("stripe_subscription_id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="No active subscription")
    try:
        sub = stripe.Subscription.modify(sub_id, cancel_at_period_end=True)
        return {"ok": True, "cancel_at_period_end": bool(sub.cancel_at_period_end)}
    except Exception as e:
        logger.error(f"Cancel subscription failed: {e}")
        raise HTTPException(status_code=500, detail="Cancellation failed")

@api_router.post("/subscription/resume")
async def resume_subscription(user: dict = Depends(get_current_user)):
    sub_id = user.get("stripe_subscription_id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="No active subscription")
    try:
        stripe.Subscription.modify(sub_id, cancel_at_period_end=False)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Resume failed")

# ---------- Profiles (Premium multi-profile) ----------
class ProfileInput(BaseModel):
    name: str
    avatar_color: Optional[str] = "#E8D2A6"
    avatar_emoji: Optional[str] = None
    is_kid: bool = False
    min_age: Optional[int] = None  # max age rating allowed if kid

@api_router.get("/profiles")
async def list_profiles(user: dict = Depends(get_current_user)):
    profiles = await db.profiles.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", 1).to_list(10)
    # Convert pin_hash presence to a boolean; never expose the hash
    result = []
    for p in profiles:
        has_pin = bool(p.get("pin_hash"))
        p.pop("pin_hash", None)
        p["has_pin"] = has_pin
        result.append(p)
    return result

@api_router.post("/profiles")
async def create_profile(inp: ProfileInput, user: dict = Depends(get_current_user)):
    if not user_public_dict(user)["premium"]:
        raise HTTPException(status_code=403, detail="Multi-profils réservé aux abonnés Premium")
    count = await db.profiles.count_documents({"user_id": user["user_id"]})
    if count >= 4:
        raise HTTPException(status_code=400, detail="Maximum 4 profils par compte")
    profile = {
        "id": f"p_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "name": inp.name,
        "avatar_color": inp.avatar_color or "#E8D2A6",
        "avatar_emoji": inp.avatar_emoji,
        "is_kid": inp.is_kid,
        "min_age": inp.min_age,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.profiles.insert_one(profile)
    return {k: v for k, v in profile.items() if k != "_id"}

@api_router.put("/profiles/{profile_id}")
async def update_profile(profile_id: str, inp: ProfileInput, user: dict = Depends(get_current_user)):
    result = await db.profiles.update_one(
        {"id": profile_id, "user_id": user["user_id"]},
        {"$set": {
            "name": inp.name,
            "avatar_color": inp.avatar_color,
            "avatar_emoji": inp.avatar_emoji,
            "is_kid": inp.is_kid,
            "min_age": inp.min_age,
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

@api_router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str, user: dict = Depends(get_current_user)):
    await db.profiles.delete_one({"id": profile_id, "user_id": user["user_id"]})
    await db.favorites.delete_many({"profile_id": profile_id})
    await db.watch_progress.delete_many({"profile_id": profile_id})
    return {"ok": True}

# ---------- Admin: Users list ----------
@api_router.get("/admin/users")
async def admin_list_users(user: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return [user_public_dict(u) | {"created_at": u.get("created_at")} for u in users]

@api_router.post("/admin/users/{user_id}/toggle-admin")
async def admin_toggle_admin(user_id: str, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Not found")
    new_val = not bool(target.get("is_admin"))
    await db.users.update_one({"user_id": user_id}, {"$set": {"is_admin": new_val}})
    return {"is_admin": new_val}

@api_router.post("/admin/users/{user_id}/toggle-premium")
async def admin_toggle_premium(user_id: str, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Not found")
    pu = target.get("premium_until")
    active = False
    if pu:
        try:
            dt = datetime.fromisoformat(pu) if isinstance(pu, str) else pu
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            active = dt > datetime.now(timezone.utc)
        except Exception:
            active = False
    if active:
        await db.users.update_one({"user_id": user_id}, {"$set": {"premium_until": None, "premium_plan": None}})
        return {"premium": False}
    until = (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat()
    await db.users.update_one({"user_id": user_id}, {"$set": {"premium_until": until, "premium_plan": "admin"}})
    return {"premium": True}

@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    await db.users.delete_one({"user_id": user_id})
    await db.reviews.delete_many({"user_id": user_id})
    await db.favorites.delete_many({"user_id": user_id})
    await db.watch_progress.delete_many({"user_id": user_id})
    await db.profiles.delete_many({"user_id": user_id})
    return {"ok": True}

# ---------- Settings ----------
class SettingsInput(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    picture: Optional[str] = None
    preferred_quality: Optional[str] = None
    autoplay_hero: Optional[bool] = None
    accent_color: Optional[str] = None

class PinInput(BaseModel):
    pin: str  # 4-6 digits
    current_pin: Optional[str] = None

@api_router.patch("/settings")
async def update_settings(inp: SettingsInput, user: dict = Depends(get_current_user)):
    upd = {}
    if inp.name is not None:
        upd["name"] = inp.name.strip()
    if inp.bio is not None:
        upd["bio"] = inp.bio.strip()
    if inp.picture is not None:
        upd["picture"] = inp.picture
    if inp.preferred_quality is not None:
        upd["preferred_quality"] = inp.preferred_quality
    if inp.autoplay_hero is not None:
        upd["autoplay_hero"] = bool(inp.autoplay_hero)
    if inp.accent_color is not None:
        if not user_public_dict(user)["premium"]:
            raise HTTPException(status_code=403, detail="Personnalisation de couleur réservée aux abonnés Premium")
        upd["accent_color"] = inp.accent_color
    if not upd:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": upd})
    fresh = await get_user_by_id(user["user_id"])
    return user_public_dict(fresh)

@api_router.post("/settings/pin")
async def set_pin(inp: PinInput, user: dict = Depends(get_current_user)):
    if not inp.pin or not inp.pin.isdigit() or not (4 <= len(inp.pin) <= 6):
        raise HTTPException(status_code=400, detail="Le PIN doit être 4 à 6 chiffres")
    existing_hash = user.get("pin_hash")
    if existing_hash:
        if not inp.current_pin or not verify_password(inp.current_pin, existing_hash):
            raise HTTPException(status_code=401, detail="PIN actuel incorrect")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"pin_hash": hash_password(inp.pin)}})
    return {"ok": True}

@api_router.delete("/settings/pin")
async def remove_pin(inp: PinInput, user: dict = Depends(get_current_user)):
    if not user.get("pin_hash"):
        raise HTTPException(status_code=400, detail="Aucun PIN défini")
    if not verify_password(inp.pin, user["pin_hash"]):
        raise HTTPException(status_code=401, detail="PIN incorrect")
    await db.users.update_one({"user_id": user["user_id"]}, {"$unset": {"pin_hash": ""}})
    return {"ok": True}

@api_router.post("/settings/verify-pin")
async def verify_user_pin(inp: PinInput, user: dict = Depends(get_current_user)):
    if not user.get("pin_hash"):
        raise HTTPException(status_code=400, detail="Aucun PIN défini")
    if not verify_password(inp.pin, user["pin_hash"]):
        raise HTTPException(status_code=401, detail="PIN incorrect")
    return {"ok": True}

# ---------- Profile PIN (kid profile lock) ----------
class ProfilePinInput(BaseModel):
    pin: str

@api_router.post("/profiles/{profile_id}/pin")
async def set_profile_pin(profile_id: str, inp: ProfilePinInput, user: dict = Depends(get_current_user)):
    if not inp.pin.isdigit() or not (4 <= len(inp.pin) <= 6):
        raise HTTPException(status_code=400, detail="Le PIN doit être 4 à 6 chiffres")
    result = await db.profiles.update_one(
        {"id": profile_id, "user_id": user["user_id"]},
        {"$set": {"pin_hash": hash_password(inp.pin)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    return {"ok": True}

@api_router.delete("/profiles/{profile_id}/pin")
async def remove_profile_pin(profile_id: str, user: dict = Depends(get_current_user)):
    result = await db.profiles.update_one(
        {"id": profile_id, "user_id": user["user_id"]},
        {"$unset": {"pin_hash": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

@api_router.post("/profiles/{profile_id}/verify-pin")
async def verify_profile_pin(profile_id: str, inp: ProfilePinInput, user: dict = Depends(get_current_user)):
    prof = await db.profiles.find_one({"id": profile_id, "user_id": user["user_id"]}, {"_id": 0})
    if not prof:
        raise HTTPException(status_code=404, detail="Not found")
    if not prof.get("pin_hash"):
        return {"ok": True}
    if not verify_password(inp.pin, prof["pin_hash"]):
        raise HTTPException(status_code=401, detail="PIN incorrect")
    return {"ok": True}

# ---------- Watch Party (WebSocket) ----------
from fastapi import WebSocket, WebSocketDisconnect

class Party:
    def __init__(self, code: str, media_id: str, host_id: str):
        self.code = code
        self.media_id = media_id
        self.host_id = host_id
        self.state = {"position_seconds": 0.0, "playing": False, "updated_at": datetime.now(timezone.utc).timestamp()}
        self.connections: List[dict] = []  # [{ws, user_id, name}]

    async def broadcast(self, payload: dict, exclude_ws: Optional[WebSocket] = None):
        dead = []
        for c in list(self.connections):
            if c["ws"] is exclude_ws:
                continue
            try:
                await c["ws"].send_json(payload)
            except Exception:
                dead.append(c)
        for d in dead:
            if d in self.connections:
                self.connections.remove(d)

PARTIES: dict = {}

class PartyCreateInput(BaseModel):
    media_id: str

@api_router.post("/party/create")
async def create_party(inp: PartyCreateInput, user: dict = Depends(get_current_user)):
    code = uuid.uuid4().hex[:6].upper()
    while code in PARTIES:
        code = uuid.uuid4().hex[:6].upper()
    PARTIES[code] = Party(code=code, media_id=inp.media_id, host_id=user["user_id"])
    return {"code": code, "media_id": inp.media_id}

@api_router.get("/party/{code}")
async def get_party(code: str):
    party = PARTIES.get(code.upper())
    if not party:
        raise HTTPException(status_code=404, detail="Salon introuvable")
    return {
        "code": party.code,
        "media_id": party.media_id,
        "host_id": party.host_id,
        "state": party.state,
        "participants": [{"user_id": c["user_id"], "name": c["name"]} for c in party.connections],
    }

@app.websocket("/api/party/{code}/ws")
async def party_ws(websocket: WebSocket, code: str, token: Optional[str] = None):
    code = code.upper()
    party = PARTIES.get(code)
    if not party:
        await websocket.close(code=4404)
        return

    # Authenticate via query token (JWT)
    user = None
    if token:
        try:
            payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
            user = await get_user_by_id(payload.get("user_id"))
        except Exception:
            user = None
    if not user:
        # allow anonymous with a friendly name
        user = {"user_id": f"anon_{uuid.uuid4().hex[:6]}", "name": "Invité"}

    await websocket.accept()
    conn = {"ws": websocket, "user_id": user["user_id"], "name": user.get("name", "Invité")}
    party.connections.append(conn)

    # Send initial state + participant list
    await websocket.send_json({
        "type": "hello",
        "code": party.code,
        "media_id": party.media_id,
        "host_id": party.host_id,
        "state": party.state,
        "you": {"user_id": conn["user_id"], "name": conn["name"]},
    })
    await party.broadcast({
        "type": "participants",
        "participants": [{"user_id": c["user_id"], "name": c["name"]} for c in party.connections],
    })

    try:
        while True:
            data = await websocket.receive_json()
            t = data.get("type")
            if t == "sync":
                # Only host controls playback
                if conn["user_id"] == party.host_id:
                    party.state = {
                        "position_seconds": float(data.get("position_seconds", 0)),
                        "playing": bool(data.get("playing", False)),
                        "updated_at": datetime.now(timezone.utc).timestamp(),
                    }
                    await party.broadcast({"type": "sync", "state": party.state}, exclude_ws=websocket)
            elif t == "chat":
                text = str(data.get("text", ""))[:500]
                if text.strip():
                    await party.broadcast({
                        "type": "chat",
                        "user_id": conn["user_id"],
                        "name": conn["name"],
                        "text": text,
                        "at": datetime.now(timezone.utc).timestamp(),
                    })
            elif t == "request_state":
                await websocket.send_json({"type": "sync", "state": party.state})
    except WebSocketDisconnect:
        pass
    finally:
        if conn in party.connections:
            party.connections.remove(conn)
        await party.broadcast({
            "type": "participants",
            "participants": [{"user_id": c["user_id"], "name": c["name"]} for c in party.connections],
        })
        if not party.connections:
            PARTIES.pop(party.code, None)

# ---------- Root ----------
@api_router.get("/")
async def root():
    return {"message": "YourMovie's API"}

# ---------- Wire ----------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    logger.info(f"Storage: {'Cloudinary configuré' if CLOUDINARY_CONFIGURED else 'AUCUN (CLOUDINARY_URL manquant)'}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
