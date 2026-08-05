from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Header, Query, Request, Response, status
from fastapi.responses import Response as FastAPIResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import random
import asyncio
import logging
import uuid
import io
import secrets
import requests
import bcrypt
import jwt as pyjwt
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------- Config ----------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET') or secrets.token_urlsafe(48)
if not os.environ.get('JWT_SECRET'):
    logging.warning("JWT_SECRET absent : secret éphémère généré (les tokens seront invalidés au redémarrage). Définir JWT_SECRET en production.")
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

# OMDb (données IMDb) — clé gratuite sur https://www.omdbapi.com/apikey.aspx
OMDB_API_KEY = os.environ.get("OMDB_API_KEY")

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
    password: str = Field(min_length=6)
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

class ReplyCreate(BaseModel):
    comment: str

class ReviewEdit(BaseModel):
    rating: Optional[float] = Field(default=None, ge=0, le=10)
    comment: Optional[str] = None

class AnnouncementCreate(BaseModel):
    title: str
    body: str = ""

class WishCreate(BaseModel):
    imdb_id: str
    title: str
    year: Optional[str] = None
    type: Optional[str] = None
    poster_url: Optional[str] = None

class WishStatus(BaseModel):
    status: Literal["pending", "approved", "refused"]

class RedeemInput(BaseModel):
    plan: Literal["basic", "standard", "premium"]
    days: int = 30

class AdminCoinsInput(BaseModel):
    amount: float = 0
    mode: Literal["add", "remove", "set", "reset"] = "add"

class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=6)
    bio: Optional[str] = None

class AdminPremiumInput(BaseModel):
    plan: Optional[Literal["basic", "standard", "premium"]] = None
    days: int = 3650
    remove: bool = False

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
        user = None
        try:
            payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
            user = await get_user_by_id(payload.get("user_id"))
        except Exception:
            user = None
        if user:
            if user.get("blocked_at"):
                raise HTTPException(status_code=403, detail="Votre compte est bloqué.")
            return user

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
                    if user.get("blocked_at"):
                        raise HTTPException(status_code=403, detail="Votre compte est bloqué.")
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

async def current_profile_id(x_profile_id: Optional[str] = Header(None, alias="X-Profile-Id")) -> Optional[str]:
    # profil actif (multi-profil premium) ; None = niveau compte / profil général
    return x_profile_id or None

ONLINE_WINDOW_SECONDS = 120

def _is_online(user: dict) -> bool:
    ls = user.get("last_seen")
    if not ls:
        return False
    try:
        dt = datetime.fromisoformat(ls) if isinstance(ls, str) else ls
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() < ONLINE_WINDOW_SECONDS
    except Exception:
        return False

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
        "coins": round(float(user.get("coins", 0) or 0), 1),
        "login_streak": int(user.get("login_streak", 0) or 0),
        "blocked": bool(user.get("blocked_at")),
        "blocked_at": user.get("blocked_at"),
        "online": _is_online(user),
        "last_seen": user.get("last_seen"),
        "profile_public": user.get("profile_public", True),
        "reviews_public": user.get("reviews_public", True),
        "history_public": user.get("history_public", True),
    }

# ---------- Freemium ----------
def _is_premium(user: dict) -> bool:
    pu = user.get("premium_until")
    if not pu:
        return False
    try:
        dt = datetime.fromisoformat(pu) if isinstance(pu, str) else pu
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt > datetime.now(timezone.utc)
    except Exception:
        return False

COIN_PLANS = {
    "basic": {"name": "Basic", "options": [
        {"days": 30, "coins": 800},
        {"days": 60, "coins": 1500},
        {"days": 90, "coins": 2100},
    ]},
    "standard": {"name": "Standard", "options": [
        {"days": 30, "coins": 2000},
        {"days": 60, "coins": 3800},
        {"days": 90, "coins": 5400},
    ]},
    "premium": {"name": "Premium", "options": [
        {"days": 30, "coins": 5000},
        {"days": 60, "coins": 9500},
        {"days": 90, "coins": 13500},
    ]},
}

def _daily_reward(streak: int) -> int:
    if streak >= 100:
        return 50
    if streak >= 50:
        return 30
    if streak >= 25:
        return 15
    if streak >= 10:
        return 7
    if streak > 5:
        return 5
    return 3

async def award_coins(user_id: str, amount: float, title: str, body: str = "") -> float:
    amount = round(float(amount), 1)
    res = await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$inc": {"coins": amount}},
        return_document=True,
    )
    new_balance = round(float((res or {}).get("coins", 0) or 0), 1) if res else 0
    await db.notifications.insert_one({
        "id": f"n_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "type": "coins",
        "title": title,
        "body": body,
        "media_title": None,
        "link": "/coins",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return new_balance

COMMENT_COOLDOWN_SECONDS = 60

async def _comment_can_earn(user: dict, text: str) -> bool:
    # anti-spam : pas de gain si < 60 s depuis le dernier commentaire, ni si texte identique au précédent.
    now = datetime.now(timezone.utc)
    earn = True
    last_at = user.get("last_comment_at")
    if last_at:
        try:
            dt = datetime.fromisoformat(last_at)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if (now - dt).total_seconds() < COMMENT_COOLDOWN_SECONDS:
                earn = False
        except Exception:
            pass
    norm = (text or "").strip().lower()
    if norm and norm == (user.get("last_comment_text") or "").strip().lower():
        earn = False
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"last_comment_at": now.isoformat(), "last_comment_text": text or ""}},
    )
    return earn

async def _unique_name(base: str) -> str:
    base = (base or "Utilisateur").strip() or "Utilisateur"
    candidate = base
    for _ in range(20):
        clash = await db.users.find_one({"name": {"$regex": f"^{re.escape(candidate)}$", "$options": "i"}}, {"_id": 0, "user_id": 1})
        if not clash:
            return candidate
        candidate = f"{base}{random.randint(1, 9999)}"
    return f"{base}{uuid.uuid4().hex[:5]}"

# ---------- Auth Routes ----------
@api_router.post("/auth/register")
async def register(inp: RegisterInput):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")
    name = (inp.name or "").strip()
    name_clash = await db.users.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}, {"_id": 0, "user_id": 1})
    if name_clash:
        raise HTTPException(status_code=400, detail="Ce pseudo est déjà pris.")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    is_admin = await db.users.count_documents({}) == 0  # first user becomes admin
    doc = {
        "user_id": user_id,
        "email": inp.email.lower(),
        "name": name,
        "password_hash": hash_password(inp.password),
        "picture": None,
        "is_admin": is_admin,
        "auth_provider": "jwt",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        # course entre deux inscriptions simultanées sur le même email
        raise HTTPException(status_code=400, detail="Email already registered")
    token = create_jwt(user_id)
    return {"token": token, "user": user_public_dict(doc)}

@api_router.post("/auth/login")
async def login(inp: LoginInput):
    user = await db.users.find_one({"email": inp.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(inp.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.get("blocked_at"):
        raise HTTPException(status_code=403, detail="Votre compte a été bloqué. Contactez le support.")
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
        # ne pas écraser le pseudo choisi ; on rafraîchit seulement la photo
        await db.users.update_one({"user_id": user_id}, {"$set": {"picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        is_admin = await db.users.count_documents({}) == 0
        name = await _unique_name(name)
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
    if user.get("blocked_at"):
        raise HTTPException(status_code=403, detail="Votre compte a été bloqué. Contactez le support.")
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
        query["title"] = {"$regex": re.escape(q), "$options": "i"}
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

async def _recompute_rating(media_id: str):
    pipeline = [
        {"$match": {"media_id": media_id, "parent_id": None}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}}},
    ]
    agg = await db.reviews.aggregate(pipeline).to_list(1)
    avg = agg[0]["avg"] if agg else None
    await db.media.update_one({"id": media_id}, {"$set": {"rating": round(avg, 1) if avg else None}})

@api_router.post("/reviews")
async def create_review(r: ReviewCreate, user: dict = Depends(get_current_user)):
    review_id = f"r_{uuid.uuid4().hex[:12]}"
    # replace existing top-level review by same user (keep their replies intact)
    await db.reviews.delete_many({"media_id": r.media_id, "user_id": user["user_id"], "parent_id": None})
    doc = {
        "id": review_id,
        "media_id": r.media_id,
        "parent_id": None,
        "user_id": user["user_id"],
        "user_name": user.get("name", "User"),
        "rating": r.rating,
        "comment": r.comment,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one(doc)
    await _recompute_rating(r.media_id)
    can_earn = await _comment_can_earn(user, r.comment)
    # récompense une seule fois par média, même après suppression de l'avis (anti-farm)
    rewarded = await db.review_rewards.find_one({"user_id": user["user_id"], "media_id": r.media_id})
    if not rewarded and can_earn:
        amt = random.randint(1, 3)
        await award_coins(user["user_id"], amt, f"+{amt} Freemium pour ton avis", "Merci d'avoir noté un titre !")
        await db.review_rewards.insert_one({"user_id": user["user_id"], "media_id": r.media_id})
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.post("/reviews/{parent_id}/reply")
async def reply_review(parent_id: str, r: ReplyCreate, user: dict = Depends(get_current_user)):
    parent = await db.reviews.find_one({"id": parent_id}, {"_id": 0})
    if not parent:
        raise HTTPException(status_code=404, detail="Not found")
    comment = (r.comment or "").strip()
    if not comment:
        raise HTTPException(status_code=400, detail="Réponse vide")
    # keep the thread flat: a reply to a reply is attached to the root review,
    # tagging who is addressed so the UI can show "@Name".
    if parent.get("parent_id"):
        root_id = parent["parent_id"]
        reply_to_name = parent.get("user_name")
    else:
        root_id = parent_id
        reply_to_name = None
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": f"r_{uuid.uuid4().hex[:12]}",
        "media_id": parent["media_id"],
        "parent_id": root_id,
        "reply_to_name": reply_to_name,
        "user_id": user["user_id"],
        "user_name": user.get("name", "User"),
        "rating": None,
        "comment": comment,
        "created_at": now,
    }
    await db.reviews.insert_one(doc)
    # notify the review author (unless they replied to themselves)
    if parent["user_id"] != user["user_id"]:
        media = await db.media.find_one({"id": parent["media_id"]}, {"_id": 0, "title": 1})
        actor = user.get("name") or "Quelqu'un"
        await db.notifications.insert_one({
            "id": f"n_{uuid.uuid4().hex[:12]}",
            "user_id": parent["user_id"],
            "type": "reply",
            "title": f"{actor} a répondu à votre avis",
            "body": comment[:140] + ("…" if len(comment) > 140 else ""),
            "media_id": parent["media_id"],
            "media_title": media.get("title") if media else "",
            "link": f"/media/{parent['media_id']}",
            "read": False,
            "created_at": now,
        })
    if await _comment_can_earn(user, comment):
        amt = random.randint(1, 3)
        await award_coins(user["user_id"], amt, f"+{amt} Freemium pour ta réponse", "Merci de participer aux discussions !")
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.patch("/reviews/{review_id}")
async def edit_review(review_id: str, r: ReviewEdit, user: dict = Depends(get_current_user)):
    doc = await db.reviews.find_one({"id": review_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if doc["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    updates = {}
    if r.comment is not None:
        updates["comment"] = r.comment
    if r.rating is not None and doc.get("parent_id") is None:
        updates["rating"] = r.rating
    if updates:
        await db.reviews.update_one({"id": review_id}, {"$set": updates})
        if "rating" in updates:
            await _recompute_rating(doc["media_id"])
    merged = {**doc, **updates}
    return {k: v for k, v in merged.items() if k != "_id"}

@api_router.delete("/reviews/{review_id}")
async def delete_review(review_id: str, user: dict = Depends(get_current_user)):
    doc = await db.reviews.find_one({"id": review_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if doc["user_id"] != user["user_id"] and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.reviews.delete_one({"id": review_id})
    # remove any replies attached to a deleted top-level review
    if doc.get("parent_id") is None:
        await db.reviews.delete_many({"parent_id": review_id})
        await _recompute_rating(doc["media_id"])
    return {"ok": True}

# ---------- Notifications & Announcements ----------
@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    personal = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    anns = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(20)
    seen_at = user.get("notif_seen_at")
    ann_items = [{
        "id": a["id"],
        "type": "announcement",
        "title": a.get("title", ""),
        "body": a.get("body", ""),
        "media_title": None,
        "link": None,
        "created_at": a.get("created_at", ""),
        "read": bool(seen_at and a.get("created_at", "") <= seen_at),
    } for a in anns]
    items = personal + ann_items
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    unread = sum(1 for it in items if not it.get("read"))
    return {"items": items[:50], "unread": unread}

@api_router.post("/notifications/read")
async def mark_notifications_read(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    await db.notifications.update_many({"user_id": user["user_id"], "read": False}, {"$set": {"read": True}})
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"notif_seen_at": now}})
    return {"ok": True}

@api_router.get("/admin/reviews")
async def admin_list_reviews(admin: dict = Depends(require_admin)):
    docs = await db.reviews.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    media_ids = list({d.get("media_id") for d in docs if d.get("media_id")})
    medias = await db.media.find({"id": {"$in": media_ids}}, {"_id": 0, "id": 1, "title": 1}).to_list(1000)
    mmap = {m["id"]: m.get("title") for m in medias}
    for d in docs:
        d["media_title"] = mmap.get(d.get("media_id"), "—")
    return docs

@api_router.get("/announcements")
async def list_announcements():
    return await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)

@api_router.post("/announcements")
async def create_announcement(a: AnnouncementCreate, admin: dict = Depends(require_admin)):
    title = (a.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Titre requis")
    doc = {
        "id": f"a_{uuid.uuid4().hex[:12]}",
        "title": title,
        "body": (a.body or "").strip(),
        "author_name": admin.get("name", "Admin"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.announcements.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.delete("/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str, admin: dict = Depends(require_admin)):
    res = await db.announcements.delete_one({"id": announcement_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

# ---------- Wishboard (demandes de titres votées) ----------
def _wish_out(doc: dict, user_id: Optional[str]) -> dict:
    voters = doc.get("voters", [])
    return {
        "id": doc.get("id"),
        "imdb_id": doc.get("imdb_id"),
        "title": doc.get("title"),
        "year": doc.get("year"),
        "type": doc.get("type"),
        "poster_url": doc.get("poster_url"),
        "status": doc.get("status", "pending"),
        "vote_count": len(voters),
        "voted": bool(user_id and user_id in voters),
        "created_at": doc.get("created_at"),
    }

@api_router.get("/imdb/search")
async def imdb_search(q: str, user: dict = Depends(get_current_user)):
    q = (q or "").strip()
    if not q:
        return []
    if not OMDB_API_KEY:
        raise HTTPException(status_code=503, detail="Recherche IMDb non configurée (clé OMDb manquante).")
    try:
        r = await run_in_threadpool(lambda: requests.get("https://www.omdbapi.com/", params={"apikey": OMDB_API_KEY, "s": q}, timeout=15))
        data = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Service IMDb indisponible.")
    if data.get("Response") == "False":
        err = (data.get("Error") or "").lower()
        # "Movie not found!" / "Too many results." = pas de résultat exploitable -> liste vide
        if "not found" in err or "too many" in err:
            return []
        # clé invalide, non activée, quota atteint... -> on remonte le message
        raise HTTPException(status_code=502, detail=f"IMDb (OMDb) : {data.get('Error', 'clé invalide ou inactive')}")
    results = []
    for it in data.get("Search", [])[:10]:
        poster = it.get("Poster")
        results.append({
            "imdb_id": it.get("imdbID"),
            "title": it.get("Title"),
            "year": it.get("Year"),
            "type": it.get("Type"),
            "poster_url": poster if poster and poster != "N/A" else None,
        })
    return results

@api_router.get("/wishboard")
async def list_wishboard(status: Optional[str] = None, user: Optional[dict] = Depends(get_optional_user)):
    query = {"status": status} if status else {"status": {"$ne": "refused"}}
    docs = await db.wishboard.find(query, {"_id": 0}).to_list(500)
    uid = user["user_id"] if user else None
    out = [_wish_out(d, uid) for d in docs]
    out.sort(key=lambda x: (x["vote_count"], x["created_at"] or ""), reverse=True)
    return out

@api_router.post("/wishboard")
async def create_wish(w: WishCreate, user: dict = Depends(get_current_user)):
    title = (w.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Titre manquant")
    # déjà disponible dans le catalogue ?
    existing = await db.media.find_one(
        {"title": {"$regex": f"^{re.escape(title)}$", "$options": "i"}}, {"_id": 0, "id": 1}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Ce titre est déjà disponible sur le site.")
    # déjà demandé ? -> on ajoute un vote
    existing_wish = await db.wishboard.find_one({"imdb_id": w.imdb_id}, {"_id": 0})
    if existing_wish:
        if existing_wish.get("status") == "approved":
            raise HTTPException(status_code=409, detail="Ce titre a déjà été approuvé — le vote est clos.")
        await db.wishboard.update_one({"id": existing_wish["id"]}, {"$addToSet": {"voters": user["user_id"]}})
        updated = await db.wishboard.find_one({"id": existing_wish["id"]}, {"_id": 0})
        return _wish_out(updated, user["user_id"])
    # limite : 5 demandes pour les non-premium, illimité en premium
    if not _is_premium(user):
        count = await db.wishboard.count_documents({"created_by": user["user_id"]})
        if count >= 5:
            raise HTTPException(status_code=403, detail="Limite de 5 demandes atteinte. Passe Premium pour un wishboard illimité.")
    doc = {
        "id": f"w_{uuid.uuid4().hex[:12]}",
        "imdb_id": w.imdb_id,
        "title": title,
        "year": w.year,
        "type": w.type,
        "poster_url": w.poster_url,
        "status": "pending",
        "voters": [user["user_id"]],
        "created_by": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.wishboard.insert_one(doc)
    amt = random.randint(1, 10) / 2  # 0.5 à 5.0
    await award_coins(user["user_id"], amt, f"+{amt} Freemium pour ta proposition", "Merci d'avoir enrichi le Wishboard !")
    return _wish_out(doc, user["user_id"])

@api_router.post("/wishboard/{wish_id}/vote")
async def vote_wish(wish_id: str, user: dict = Depends(get_current_user)):
    doc = await db.wishboard.find_one({"id": wish_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if doc.get("status") == "approved":
        raise HTTPException(status_code=409, detail="Ce titre a été approuvé — le vote est clos.")
    if user["user_id"] in doc.get("voters", []):
        await db.wishboard.update_one({"id": wish_id}, {"$pull": {"voters": user["user_id"]}})
        voted = False
    else:
        await db.wishboard.update_one({"id": wish_id}, {"$addToSet": {"voters": user["user_id"]}})
        voted = True
    updated = await db.wishboard.find_one({"id": wish_id}, {"_id": 0})
    return {"voted": voted, "vote_count": len(updated.get("voters", []))}

@api_router.get("/admin/wishboard")
async def admin_list_wishboard(admin: dict = Depends(require_admin)):
    docs = await db.wishboard.find({}, {"_id": 0}).to_list(1000)
    out = [_wish_out(d, None) for d in docs]
    out.sort(key=lambda x: x["vote_count"], reverse=True)
    return out

@api_router.patch("/wishboard/{wish_id}/status")
async def set_wish_status(wish_id: str, s: WishStatus, admin: dict = Depends(require_admin)):
    res = await db.wishboard.update_one({"id": wish_id}, {"$set": {"status": s.status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True, "status": s.status}

@api_router.delete("/wishboard/{wish_id}")
async def delete_wish(wish_id: str, admin: dict = Depends(require_admin)):
    res = await db.wishboard.delete_one({"id": wish_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

# ---------- Freemium : gains & achat ----------
@api_router.post("/rewards/daily")
async def rewards_daily(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    yesterday = (now.date() - timedelta(days=1)).isoformat()
    last = user.get("last_reward_date")
    already_resp = {"awarded": 0, "coins": round(float(user.get("coins", 0) or 0), 1), "streak": int(user.get("login_streak", 0) or 0), "already": True}
    if last == today:
        return already_resp
    welcome = not user.get("first_login_awarded")
    if welcome:
        streak = 1
        amount = 10
        set_fields = {"first_login_awarded": True, "login_streak": 1, "last_reward_date": today}
    else:
        streak = int(user.get("login_streak", 0) or 0) + 1 if last == yesterday else 1
        amount = _daily_reward(streak)
        set_fields = {"login_streak": streak, "last_reward_date": today}
    # garde atomique : un seul claim par jour même en cas de requêtes concurrentes
    guard = await db.users.update_one(
        {"user_id": user["user_id"], "last_reward_date": {"$ne": today}},
        {"$set": set_fields},
    )
    if guard.matched_count == 0:
        return already_resp
    if welcome:
        balance = await award_coins(user["user_id"], 10, "Bienvenue ! +10 Freemium", "Merci d'avoir rejoint YourMovie's. Reviens chaque jour pour gagner plus.")
        return {"awarded": 10, "coins": balance, "streak": 1, "welcome": True}
    balance = await award_coins(user["user_id"], amount, f"+{amount} Freemium · série de {streak} jour(s)", "Reviens demain sinon tu perds ta série !")
    return {"awarded": amount, "coins": balance, "streak": streak}

@api_router.get("/coins/plans")
async def coins_plans(user: dict = Depends(get_current_user)):
    return {
        "balance": round(float(user.get("coins", 0) or 0), 1),
        "plans": [{"id": k, "name": v["name"], "options": v["options"]} for k, v in COIN_PLANS.items()],
    }

@api_router.post("/coins/redeem")
async def coins_redeem(inp: RedeemInput, user: dict = Depends(get_current_user)):
    plan = COIN_PLANS.get(inp.plan)
    if not plan:
        raise HTTPException(status_code=400, detail="Plan inconnu")
    option = next((o for o in plan["options"] if o["days"] == inp.days), None)
    if not option:
        raise HTTPException(status_code=400, detail="Durée invalide")
    cost = option["coins"]
    days = option["days"]
    base = datetime.now(timezone.utc)
    current = user.get("premium_until")
    if current:
        try:
            dt = datetime.fromisoformat(current) if isinstance(current, str) else current
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt > base:
                base = dt
        except Exception:
            pass
    until = (base + timedelta(days=days)).isoformat()
    # débit atomique : la condition coins >= cost et le décrément sont indissociables (anti-TOCTOU)
    res = await db.users.find_one_and_update(
        {"user_id": user["user_id"], "coins": {"$gte": cost}},
        {"$inc": {"coins": -cost}, "$set": {"premium_plan": inp.plan, "premium_until": until}},
        return_document=ReturnDocument.AFTER,
    )
    if res is None:
        balance = float(user.get("coins", 0) or 0)
        raise HTTPException(status_code=400, detail=f"Solde insuffisant : il te faut {cost} Freemium (tu en as {round(balance, 1)}).")
    await db.notifications.insert_one({
        "id": f"n_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "type": "coins",
        "title": f"Premium {plan['name']} activé 🎉",
        "body": f"-{cost} Freemium · {days} jours de Premium",
        "media_title": None,
        "link": "/coins",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "premium_until": until, "plan": inp.plan, "days": days}

# ---------- Profils publics & recherche d'utilisateurs ----------
@api_router.get("/users/search")
async def users_search(q: str, user: dict = Depends(get_current_user)):
    q = (q or "").strip()
    if not q:
        return []
    docs = await db.users.find(
        {"name": {"$regex": re.escape(q), "$options": "i"}},
        {"_id": 0, "user_id": 1, "name": 1, "picture": 1},
    ).limit(10).to_list(10)
    return [{"user_id": d["user_id"], "name": d.get("name"), "picture": d.get("picture")} for d in docs]

@api_router.get("/users/{user_id}/public")
async def user_public_profile(user_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    # accepte un user_id OU un pseudo (ex: /u/Lune27)
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        u = await db.users.find_one({"name": {"$regex": f"^{re.escape(user_id)}$", "$options": "i"}}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    uid = u["user_id"]
    is_self = bool(viewer and viewer["user_id"] == uid)
    followers = await db.follows.count_documents({"following_id": uid})
    following = await db.follows.count_documents({"follower_id": uid})
    is_following = bool(viewer and not is_self and await db.follows.find_one({"follower_id": viewer["user_id"], "following_id": uid}))
    base = {
        "user_id": uid,
        "name": u.get("name"),
        "picture": u.get("picture"),
        "premium": _is_premium(u),
        "online": _is_online(u),
        "created_at": u.get("created_at"),
        "followers": followers,
        "following": following,
        "is_following": is_following,
        "is_self": is_self,
    }
    # profil privé : on masque le contenu aux visiteurs (le propriétaire voit tout)
    if not u.get("profile_public", True) and not is_self:
        return {**base, "private": True}

    reviews_ok = u.get("reviews_public", True) or is_self
    history_ok = u.get("history_public", True) or is_self

    review_count = await db.reviews.count_documents({"user_id": uid, "parent_id": None})
    review_items = []
    if reviews_ok:
        reviews = await db.reviews.find({"user_id": uid, "parent_id": None}, {"_id": 0}).sort("created_at", -1).to_list(20)
        rmids = list({r.get("media_id") for r in reviews})
        rmedias = await db.media.find({"id": {"$in": rmids}}, {"_id": 0, "id": 1, "title": 1, "poster_url": 1}).to_list(100)
        rmap = {m["id"]: m for m in rmedias}
        review_items = [{
            "id": r["id"], "media_id": r.get("media_id"),
            "media_title": (rmap.get(r.get("media_id")) or {}).get("title"),
            "poster_url": (rmap.get(r.get("media_id")) or {}).get("poster_url"),
            "rating": r.get("rating"), "comment": r.get("comment"), "created_at": r.get("created_at"),
        } for r in reviews]

    # top 10 des derniers titres regardés (dédup par média)
    watched = []
    if history_ok:
        progress = await db.watch_progress.find({"user_id": uid}, {"_id": 0}).sort("updated_at", -1).to_list(60)
        ordered_ids = []
        for p in progress:
            mid = p.get("media_id")
            if mid and mid not in ordered_ids:
                ordered_ids.append(mid)
            if len(ordered_ids) >= 10:
                break
        wmedias = await db.media.find({"id": {"$in": ordered_ids}}, {"_id": 0, "id": 1, "title": 1, "poster_url": 1, "type": 1}).to_list(10)
        wmap = {m["id"]: m for m in wmedias}
        watched = [{"id": mid, "title": wmap[mid].get("title"), "poster_url": wmap[mid].get("poster_url"), "type": wmap[mid].get("type")} for mid in ordered_ids if mid in wmap]

    return {
        **base,
        "bio": u.get("bio"),
        "review_count": review_count,
        "reviews": review_items,
        "reviews_hidden": not reviews_ok,
        "watched": watched,
        "history_hidden": not history_ok,
    }

@api_router.post("/users/{user_id}/follow")
async def toggle_follow(user_id: str, viewer: dict = Depends(get_current_user)):
    if user_id == viewer["user_id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous suivre vous-même.")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "user_id": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    existing = await db.follows.find_one({"follower_id": viewer["user_id"], "following_id": user_id})
    if existing:
        await db.follows.delete_one({"follower_id": viewer["user_id"], "following_id": user_id})
        following = False
    else:
        await db.follows.insert_one({"follower_id": viewer["user_id"], "following_id": user_id, "created_at": datetime.now(timezone.utc).isoformat()})
        following = True
    count = await db.follows.count_documents({"following_id": user_id})
    return {"is_following": following, "followers": count}

@api_router.post("/presence/ping")
async def presence_ping(user: dict = Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"last_seen": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}

# ---------- Messagerie privée ----------
class MessageInput(BaseModel):
    text: str

# état de frappe éphémère en mémoire : (from_id, to_id) -> timestamp d'expiration
TYPING: dict = {}
TYPING_TTL = 5  # secondes

@api_router.post("/messages/{other_id}")
async def send_message(other_id: str, inp: MessageInput, user: dict = Depends(get_current_user)):
    if other_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous écrire à vous-même.")
    text = (inp.text or "").strip()[:2000]
    if not text:
        raise HTTPException(status_code=400, detail="Message vide")
    other = await db.users.find_one({"user_id": other_id}, {"_id": 0, "user_id": 1, "blocked_at": 1})
    if not other:
        raise HTTPException(status_code=404, detail="Destinataire introuvable")
    if other.get("blocked_at"):
        raise HTTPException(status_code=400, detail="Ce compte est bloqué.")
    doc = {
        "id": f"m_{uuid.uuid4().hex[:12]}",
        "from_id": user["user_id"],
        "to_id": other_id,
        "text": text,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.get("/messages/{other_id}")
async def get_conversation(other_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    other = await db.users.find_one({"user_id": other_id}, {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "last_seen": 1})
    if not other:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    msgs = await db.messages.find(
        {"$or": [{"from_id": uid, "to_id": other_id}, {"from_id": other_id, "to_id": uid}]},
        {"_id": 0},
    ).sort("created_at", 1).to_list(500)
    # marque comme lus les messages reçus de cet utilisateur
    await db.messages.update_many({"from_id": other_id, "to_id": uid, "read": False}, {"$set": {"read": True}})
    now_ts = datetime.now(timezone.utc).timestamp()
    other_typing = TYPING.get((other_id, uid), 0) > now_ts
    return {
        "other": {"user_id": other["user_id"], "name": other.get("name"), "picture": other.get("picture"), "online": _is_online(other)},
        "messages": msgs,
        "other_typing": other_typing,
    }

@api_router.post("/messages/{other_id}/typing")
async def typing_signal(other_id: str, user: dict = Depends(get_current_user)):
    TYPING[(user["user_id"], other_id)] = datetime.now(timezone.utc).timestamp() + TYPING_TTL
    return {"ok": True}

@api_router.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    msgs = await db.messages.find(
        {"$or": [{"from_id": uid}, {"to_id": uid}]}, {"_id": 0},
    ).sort("created_at", -1).to_list(1000)
    convos = {}
    for m in msgs:
        partner = m["to_id"] if m["from_id"] == uid else m["from_id"]
        if partner not in convos:
            convos[partner] = {"partner_id": partner, "last_text": m["text"], "last_at": m["created_at"], "unread": 0}
        if m["from_id"] == partner and not m.get("read"):
            convos[partner]["unread"] += 1
    partner_ids = list(convos.keys())
    users = await db.users.find({"user_id": {"$in": partner_ids}}, {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "last_seen": 1}).to_list(500)
    umap = {u["user_id"]: u for u in users}
    out = []
    for pid, c in convos.items():
        pu = umap.get(pid, {})
        out.append({**c, "name": pu.get("name", "Utilisateur"), "picture": pu.get("picture"), "online": _is_online(pu)})
    out.sort(key=lambda x: x["last_at"], reverse=True)
    return out

@api_router.get("/messages/unread/count")
async def unread_messages_count(user: dict = Depends(get_current_user)):
    n = await db.messages.count_documents({"to_id": user["user_id"], "read": False})
    return {"count": n}

@api_router.post("/admin/coins/{user_id}")
async def admin_set_coins(user_id: str, inp: AdminCoinsInput, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Not found")
    current = float(target.get("coins", 0) or 0)
    if inp.mode == "reset":
        new = 0.0
    elif inp.mode == "set":
        new = max(0.0, float(inp.amount))
    elif inp.mode == "remove":
        new = max(0.0, current - float(inp.amount))
    else:
        new = current + float(inp.amount)
    new = round(new, 1)
    await db.users.update_one({"user_id": user_id}, {"$set": {"coins": new}})
    return {"coins": new}

# ---------- Favorites / Watchlist ----------
@api_router.get("/favorites")
async def list_favorites(user: dict = Depends(get_current_user), profile_id: Optional[str] = Depends(current_profile_id)):
    favs = await db.favorites.find({"user_id": user["user_id"], "profile_id": profile_id}, {"_id": 0}).to_list(500)
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
async def toggle_favorite(media_id: str, list_type: str = Query("favorite"), user: dict = Depends(get_current_user), profile_id: Optional[str] = Depends(current_profile_id)):
    q = {"user_id": user["user_id"], "media_id": media_id, "list_type": list_type, "profile_id": profile_id}
    existing = await db.favorites.find_one(q)
    if existing:
        await db.favorites.delete_one(q)
        return {"active": False}
    await db.favorites.insert_one({
        "user_id": user["user_id"],
        "profile_id": profile_id,
        "media_id": media_id,
        "list_type": list_type,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"active": True}

@api_router.get("/favorites/status/{media_id}")
async def favorite_status(media_id: str, user: dict = Depends(get_current_user), profile_id: Optional[str] = Depends(current_profile_id)):
    fav = await db.favorites.find_one({"user_id": user["user_id"], "media_id": media_id, "list_type": "favorite", "profile_id": profile_id})
    watch = await db.favorites.find_one({"user_id": user["user_id"], "media_id": media_id, "list_type": "watchlist", "profile_id": profile_id})
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
    r = await run_in_threadpool(lambda: requests.post(
        f"https://video.bunnycdn.com/library/{BUNNY_LIBRARY_ID}/videos",
        headers={"AccessKey": BUNNY_API_KEY, "Content-Type": "application/json"},
        json={"title": title}, timeout=30,
    ))
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
    r = await run_in_threadpool(lambda: requests.get(
        f"https://video.bunnycdn.com/library/{BUNNY_LIBRARY_ID}/videos/{video_id}",
        headers={"AccessKey": BUNNY_API_KEY}, timeout=15,
    ))
    if not r.ok:
        raise HTTPException(status_code=500, detail="Statut vidéo indisponible")
    j = r.json()
    return {"status": j.get("status"), "encodeProgress": j.get("encodeProgress", 0), "availableResolutions": j.get("availableResolutions")}

# ---------- Plans / Stripe ----------
import stripe

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY") or ""
stripe.api_key = STRIPE_SECRET_KEY or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_CONFIGURED = STRIPE_SECRET_KEY.startswith("sk_")

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

def _plan_price_from_lookup(lookup_key: str):
    plan_id = lookup_key.replace("ym_", "").rsplit("_", 1)[0]  # basic/standard/premium
    interval = "yearly" if lookup_key.endswith("_yearly") else "monthly"
    plan = next((p for p in PLANS if p["id"] == plan_id), None)
    if not plan:
        return None, plan_id, interval, 0, "eur"
    price = plan["prices"].get(interval, {})
    return plan, plan_id, interval, float(price.get("amount", 0) or 0), price.get("currency", "eur")

@api_router.post("/payments/checkout")
async def create_checkout(req: CheckoutRequest, user: dict = Depends(get_current_user)):
    if not STRIPE_CONFIGURED:
        raise HTTPException(status_code=503, detail="Paiement indisponible : Stripe n'est pas configuré (STRIPE_SECRET_KEY manquante).")
    plan, plan_id, interval, amount, currency = _plan_price_from_lookup(req.lookup_key)
    if not plan or amount <= 0:
        raise HTTPException(status_code=400, detail=f"Plan inconnu : {req.lookup_key}")
    try:
        unit_amount = int(round(amount * 100))
        session = await run_in_threadpool(lambda: stripe.checkout.Session.create(
            line_items=[{
                "price_data": {
                    "currency": currency,
                    "unit_amount": unit_amount,
                    "product_data": {"name": f"YourMovie's {plan['name']} ({'annuel' if interval == 'yearly' else 'mensuel'})"},
                    "recurring": {"interval": "year" if interval == "yearly" else "month"},
                },
                "quantity": 1,
            }],
            mode="subscription",
            success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{req.origin_url}/pricing",
            metadata={"user_id": user["user_id"], "lookup_key": req.lookup_key, "kind": "subscription"},
        ))
        await db.payment_transactions.insert_one({
            "session_id": session.id,
            "user_id": user["user_id"],
            "lookup_key": req.lookup_key,
            "kind": "subscription",
            "amount": unit_amount,
            "currency": currency,
            "status": "initiated",
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"checkout_url": session.url, "session_id": session.id}
    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        logger.error(f"Checkout failed: {e}")
        raise HTTPException(status_code=400, detail=(getattr(e, "user_message", "") or "Échec de l'initialisation du paiement."))
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

async def _on_payment_paid(session_id: str, subscription_id: Optional[str] = None):
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        return
    if tx.get("kind") == "donation":
        if not tx.get("credited"):
            await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"credited": True}})
            amount_eur = round((tx.get("amount") or 0) / 100, 2)
            await db.cagnotte.update_one({"id": "main"}, {"$inc": {"total": amount_eur}}, upsert=True)
    else:
        await _apply_paid_subscription(session_id, subscription_id=subscription_id or tx.get("stripe_subscription_id"))

@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, user: dict = Depends(get_current_user)):
    record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Transaction not found")
    # seul le propriétaire de la transaction (ou un admin) peut consulter son statut
    if record.get("user_id") != user["user_id"] and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accès refusé")
    if record.get("payment_status") != "paid":
        try:
            s = await run_in_threadpool(lambda: stripe.checkout.Session.retrieve(session_id))
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
                await _on_payment_paid(session_id, subscription_id=s.subscription)
                record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        except stripe.error.StripeError:
            pass
    return {"session_id": record["session_id"], "status": record["status"], "payment_status": record["payment_status"], "kind": record.get("kind", "subscription")}

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
        await _on_payment_paid(obj["id"], subscription_id=obj.get("subscription"))
    elif t == "checkout.session.async_payment_succeeded":
        await db.payment_transactions.update_one({"session_id": obj["id"]},
            {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc).isoformat()}})
        await _on_payment_paid(obj["id"])
    elif t == "checkout.session.async_payment_failed":
        await db.payment_transactions.update_one({"session_id": obj["id"]},
            {"$set": {"status": "failed", "payment_status": "failed", "updated_at": datetime.now(timezone.utc).isoformat()}})
    elif t == "checkout.session.expired":
        await db.payment_transactions.update_one({"session_id": obj["id"]},
            {"$set": {"status": "expired", "payment_status": "expired", "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"status": "ok"}

# ---------- Cagnotte ----------
CAGNOTTE_GOAL = 1000.0

class CagnotteSetInput(BaseModel):
    total: float

class ContributeInput(BaseModel):
    amount: float
    origin_url: str

def _refund_pct(total: float, goal: float) -> float:
    # remboursement équitable si l'objectif n'est pas atteint : croît avec le manque à gagner,
    # plafonné à 10 % (coût absolu max ~2,5 % de l'objectif -> l'organisateur reste rentable).
    if goal <= 0 or total >= goal:
        return 0.0
    return round(min(10.0, 10.0 * (goal - total) / goal), 1)

async def _get_cagnotte() -> dict:
    doc = await db.cagnotte.find_one({"id": "main"}, {"_id": 0})
    if not doc:
        doc = {"id": "main", "total": 0.0, "goal": CAGNOTTE_GOAL}
        await db.cagnotte.insert_one(doc)
    total = round(float(doc.get("total", 0) or 0), 2)
    goal = float(doc.get("goal", CAGNOTTE_GOAL) or CAGNOTTE_GOAL)
    return {"total": total, "goal": goal, "reached": total >= goal, "refund_pct": _refund_pct(total, goal)}

@api_router.get("/cagnotte")
async def get_cagnotte():
    return await _get_cagnotte()

@api_router.post("/admin/cagnotte")
async def set_cagnotte(inp: CagnotteSetInput, admin: dict = Depends(require_admin)):
    total = max(0.0, round(float(inp.total), 2))
    await db.cagnotte.update_one({"id": "main"}, {"$set": {"total": total, "goal": CAGNOTTE_GOAL}}, upsert=True)
    return await _get_cagnotte()

@api_router.post("/cagnotte/contribute")
async def contribute_cagnotte(inp: ContributeInput, user: dict = Depends(get_current_user)):
    if not STRIPE_CONFIGURED:
        raise HTTPException(status_code=503, detail="Contributions indisponibles : Stripe n'est pas configuré (STRIPE_SECRET_KEY manquante).")
    amount = round(float(inp.amount), 2)
    if amount < 1:
        raise HTTPException(status_code=400, detail="Montant minimum : 1 €.")
    try:
        unit_amount = int(round(amount * 100))
        session = await run_in_threadpool(lambda: stripe.checkout.Session.create(
            line_items=[{
                "price_data": {
                    "currency": "eur",
                    "unit_amount": unit_amount,
                    "product_data": {"name": "Contribution à la cagnotte YourMovie's"},
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{inp.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{inp.origin_url}/cagnotte",
            metadata={"user_id": user["user_id"], "kind": "donation"},
        ))
        await db.payment_transactions.insert_one({
            "session_id": session.id,
            "user_id": user["user_id"],
            "kind": "donation",
            "amount": unit_amount,
            "currency": "eur",
            "status": "initiated",
            "payment_status": "pending",
            "credited": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"checkout_url": session.url, "session_id": session.id}
    except stripe.error.StripeError as e:
        logger.error(f"Donation checkout failed: {e}")
        raise HTTPException(status_code=400, detail=(getattr(e, "user_message", "") or "Échec de l'initialisation du paiement."))

# ---------- Watch Progress ----------
class WatchProgressInput(BaseModel):
    media_id: str
    position_seconds: float
    duration_seconds: Optional[float] = None

@api_router.post("/watch-progress")
async def save_progress(inp: WatchProgressInput, user: dict = Depends(get_current_user), profile_id: Optional[str] = Depends(current_profile_id)):
    await db.watch_progress.update_one(
        {"user_id": user["user_id"], "media_id": inp.media_id, "profile_id": profile_id},
        {"$set": {
            "user_id": user["user_id"],
            "profile_id": profile_id,
            "media_id": inp.media_id,
            "position_seconds": inp.position_seconds,
            "duration_seconds": inp.duration_seconds,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}

@api_router.get("/watch-progress")
async def list_progress(user: dict = Depends(get_current_user), profile_id: Optional[str] = Depends(current_profile_id)):
    docs = await db.watch_progress.find({"user_id": user["user_id"], "profile_id": profile_id}, {"_id": 0}).sort("updated_at", -1).to_list(50)
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
            sub = await run_in_threadpool(lambda: stripe.Subscription.retrieve(sub_id))
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
        sub = await run_in_threadpool(lambda: stripe.Subscription.modify(sub_id, cancel_at_period_end=True))
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
        await run_in_threadpool(lambda: stripe.Subscription.modify(sub_id, cancel_at_period_end=False))
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
    await db.favorites.delete_many({"profile_id": profile_id, "user_id": user["user_id"]})
    await db.watch_progress.delete_many({"profile_id": profile_id, "user_id": user["user_id"]})
    return {"ok": True}

# ---------- Admin: Users list ----------
@api_router.get("/admin/users")
async def admin_list_users(user: dict = Depends(require_admin)):
    await _purge_expired_blocked()
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return [user_public_dict(u) | {"created_at": u.get("created_at")} for u in users]

@api_router.get("/admin/users/{user_id}")
async def admin_get_user(user_id: str, admin: dict = Depends(require_admin)):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    review_count = await db.reviews.count_documents({"user_id": user_id, "parent_id": None})
    return user_public_dict(u) | {"created_at": u.get("created_at"), "review_count": review_count}

@api_router.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, inp: AdminUserUpdate, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    updates = {}
    if inp.name is not None:
        new_name = inp.name.strip()
        name_clash = await db.users.find_one({"name": {"$regex": f"^{re.escape(new_name)}$", "$options": "i"}, "user_id": {"$ne": user_id}}, {"_id": 0, "user_id": 1})
        if name_clash:
            raise HTTPException(status_code=400, detail="Ce pseudo est déjà pris par un autre compte.")
        updates["name"] = new_name
    if inp.email is not None:
        new_email = inp.email.lower()
        clash = await db.users.find_one({"email": new_email, "user_id": {"$ne": user_id}}, {"_id": 0, "user_id": 1})
        if clash:
            raise HTTPException(status_code=400, detail="Cet email est déjà utilisé par un autre compte.")
        updates["email"] = new_email
    if inp.bio is not None:
        updates["bio"] = inp.bio
    if inp.password:
        updates["password_hash"] = hash_password(inp.password)
    if updates:
        try:
            await db.users.update_one({"user_id": user_id}, {"$set": updates})
        except DuplicateKeyError:
            raise HTTPException(status_code=400, detail="Cet email est déjà utilisé par un autre compte.")
    updated = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return user_public_dict(updated) | {"created_at": updated.get("created_at")}

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

@api_router.post("/admin/users/{user_id}/premium")
async def admin_set_premium(user_id: str, inp: AdminPremiumInput, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Not found")
    if inp.remove or not inp.plan:
        await db.users.update_one({"user_id": user_id}, {"$set": {"premium_until": None, "premium_plan": None}})
        return {"premium": False}
    until = (datetime.now(timezone.utc) + timedelta(days=max(1, inp.days))).isoformat()
    await db.users.update_one({"user_id": user_id}, {"$set": {"premium_until": until, "premium_plan": inp.plan}})
    return {"premium": True, "plan": inp.plan, "premium_until": until}

BLOCK_DELETE_DAYS = 15

async def _delete_user_data(user_id: str):
    await db.users.delete_one({"user_id": user_id})
    await db.reviews.delete_many({"user_id": user_id})
    await db.favorites.delete_many({"user_id": user_id})
    await db.watch_progress.delete_many({"user_id": user_id})
    await db.profiles.delete_many({"user_id": user_id})
    await db.notifications.delete_many({"user_id": user_id})
    await db.wishboard.update_many({}, {"$pull": {"voters": user_id}})
    await db.review_rewards.delete_many({"user_id": user_id})
    await db.messages.delete_many({"$or": [{"from_id": user_id}, {"to_id": user_id}]})
    await db.follows.delete_many({"$or": [{"follower_id": user_id}, {"following_id": user_id}]})

async def _dedupe_accounts() -> int:
    # supprime les comptes en double (même email OU même pseudo, insensible à la casse).
    # On garde en priorité les admins, puis le compte le plus ancien.
    users = await db.users.find({}, {"_id": 0, "user_id": 1, "email": 1, "name": 1, "is_admin": 1, "created_at": 1}).to_list(10000)
    users.sort(key=lambda u: (0 if u.get("is_admin") else 1, u.get("created_at") or ""))
    seen_email, seen_name, to_delete = set(), set(), []
    for u in users:
        em = (u.get("email") or "").strip().lower()
        nm = (u.get("name") or "").strip().lower()
        if (em and em in seen_email) or (nm and nm in seen_name):
            to_delete.append(u["user_id"])
        else:
            if em:
                seen_email.add(em)
            if nm:
                seen_name.add(nm)
    for uid in to_delete:
        await _delete_user_data(uid)
    if to_delete:
        logger.info(f"Dédup : {len(to_delete)} compte(s) en double supprimé(s)")
    return len(to_delete)

@api_router.post("/admin/dedupe")
async def admin_dedupe(admin: dict = Depends(require_admin)):
    removed = await _dedupe_accounts()
    return {"removed": removed}

async def _purge_expired_blocked() -> int:
    # supprime définitivement les comptes bloqués depuis plus de BLOCK_DELETE_DAYS jours
    cutoff = (datetime.now(timezone.utc) - timedelta(days=BLOCK_DELETE_DAYS)).isoformat()
    expired = await db.users.find({"blocked_at": {"$type": "string", "$lte": cutoff}}, {"_id": 0, "user_id": 1}).to_list(500)
    for u in expired:
        await _delete_user_data(u["user_id"])
    if expired:
        logger.info(f"Purge auto : {len(expired)} compte(s) bloqué(s) > {BLOCK_DELETE_DAYS}j supprimé(s)")
    return len(expired)

@api_router.post("/admin/users/{user_id}/toggle-block")
async def admin_toggle_block(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas bloquer votre propre compte")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Not found")
    if target.get("blocked_at"):
        await db.users.update_one({"user_id": user_id}, {"$unset": {"blocked_at": ""}})
        return {"blocked": False, "blocked_at": None}
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"user_id": user_id}, {"$set": {"blocked_at": now}})
    return {"blocked": True, "blocked_at": now, "delete_after_days": BLOCK_DELETE_DAYS}

@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    await _delete_user_data(user_id)
    return {"ok": True}

# ---------- Settings ----------
class SettingsInput(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    picture: Optional[str] = None
    preferred_quality: Optional[str] = None
    autoplay_hero: Optional[bool] = None
    accent_color: Optional[str] = None
    profile_public: Optional[bool] = None
    reviews_public: Optional[bool] = None
    history_public: Optional[bool] = None

class PinInput(BaseModel):
    pin: str  # 4-6 digits
    current_pin: Optional[str] = None

@api_router.patch("/settings")
async def update_settings(inp: SettingsInput, user: dict = Depends(get_current_user)):
    upd = {}
    if inp.name is not None:
        new_name = inp.name.strip()
        clash = await db.users.find_one({"name": {"$regex": f"^{re.escape(new_name)}$", "$options": "i"}, "user_id": {"$ne": user["user_id"]}}, {"_id": 0, "user_id": 1})
        if clash:
            raise HTTPException(status_code=400, detail="Ce pseudo est déjà pris.")
        upd["name"] = new_name
    if inp.bio is not None:
        upd["bio"] = inp.bio.strip()
    if inp.picture is not None:
        upd["picture"] = inp.picture
    if inp.preferred_quality is not None:
        upd["preferred_quality"] = inp.preferred_quality
    if inp.autoplay_hero is not None:
        upd["autoplay_hero"] = bool(inp.autoplay_hero)
    if inp.profile_public is not None:
        upd["profile_public"] = bool(inp.profile_public)
    if inp.reviews_public is not None:
        upd["reviews_public"] = bool(inp.reviews_public)
    if inp.history_public is not None:
        upd["history_public"] = bool(inp.history_public)
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
async def get_party(code: str, user: dict = Depends(get_current_user)):
    party = PARTIES.get(code.upper())
    if not party:
        raise HTTPException(status_code=404, detail="Salon introuvable")
    return {
        "code": party.code,
        "media_id": party.media_id,
        "host_id": party.host_id,
        "state": party.state,
        "participants": _party_participants(party),
    }

def _party_participants(party: "Party") -> list:
    return [{"user_id": c["user_id"], "name": c["name"], "is_host": c.get("account_id") == party.host_id} for c in party.connections]

@app.websocket("/api/party/{code}/ws")
async def party_ws(websocket: WebSocket, code: str, token: Optional[str] = None, profile: Optional[str] = None, name: Optional[str] = None):
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
    # identité côté profil : distingue les participants d'un même compte,
    # tout en gardant la détection d'hôte par compte (account_id)
    account_id = user["user_id"]
    display_name = (name or "").strip() or user.get("name", "Invité")
    conn_id = f"{account_id}:{profile}" if profile else account_id
    conn = {"ws": websocket, "user_id": conn_id, "account_id": account_id, "name": display_name}
    party.connections.append(conn)

    # Send initial state + participant list
    await websocket.send_json({
        "type": "hello",
        "code": party.code,
        "media_id": party.media_id,
        "host_id": party.host_id,
        "state": party.state,
        "you": {"user_id": conn["user_id"], "name": conn["name"], "is_host": account_id == party.host_id},
    })
    await party.broadcast({
        "type": "participants",
        "participants": _party_participants(party),
    })

    try:
        while True:
            data = await websocket.receive_json()
            t = data.get("type")
            if t == "sync":
                # Only host controls playback (comparaison par compte)
                if conn["account_id"] == party.host_id:
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
            "participants": _party_participants(party),
        })
        if not party.connections:
            PARTIES.pop(party.code, None)

# ---------- Root ----------
@api_router.get("/")
async def root():
    return {"message": "YourMovie's API"}

# ---------- Wire ----------
app.include_router(api_router)

# CORS : jamais de credentials avec un wildcard. Si CORS_ORIGINS n'est pas défini
# (ou vaut '*'), on autorise '*' mais sans credentials pour éviter le fail-open.
_cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()]
_cors_credentials = _cors_origins != ['*']
app.add_middleware(
    CORSMiddleware,
    allow_credentials=_cors_credentials,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    logger.info(f"Storage: {'Cloudinary configuré' if CLOUDINARY_CONFIGURED else 'AUCUN (CLOUDINARY_URL manquant)'}")
    # nettoyage des comptes en double (même email/pseudo) au démarrage
    try:
        await _dedupe_accounts()
    except Exception as e:
        logger.warning(f"Déduplication au démarrage échouée : {e}")
    # index uniques : bloque les doublons email / user_id (courses d'inscription).
    # En try/except : si des doublons existent déjà en base, on n'empêche pas le démarrage.
    try:
        await db.users.create_index("user_id", unique=True)
        await db.users.create_index("email", unique=True)
    except Exception as e:
        logger.warning(f"Index unique users non créé (doublons existants ?) : {e}")
    # purge périodique des comptes bloqués depuis > 15 jours
    asyncio.create_task(_blocked_purge_loop())

async def _blocked_purge_loop():
    while True:
        try:
            await _purge_expired_blocked()
        except Exception as e:
            logger.warning(f"Purge comptes bloqués échouée : {e}")
        await asyncio.sleep(6 * 3600)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
