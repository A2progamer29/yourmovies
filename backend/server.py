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
import hashlib
import time
import unicodedata
import requests
import bcrypt
import jwt as pyjwt
from pymongo import ReturnDocument, UpdateOne
from pymongo.errors import DuplicateKeyError
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

try:
    from .license_key_seed import LICENSE_KEY_SEED, LICENSE_KEY_SEED_VERSION
except ImportError:
    from license_key_seed import LICENSE_KEY_SEED, LICENSE_KEY_SEED_VERSION

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

@app.middleware("http")
async def security_and_abuse_guard(request: Request, call_next):
    if request.url.path.startswith("/api"):
        configured = os.environ.get("CORS_ORIGINS", "https://yourmovies.space,https://www.yourmovies.space,https://yourmovies.online,https://yourmovies-eight.vercel.app")
        allowed = {value.strip() for value in configured.split(",") if value.strip() and value.strip() != "*"}
        origin = request.headers.get("origin")
        if origin and origin not in allowed:
            return FastAPIResponse(content='{"detail":"Origine non autorisée"}', status_code=403, media_type="application/json")
        if request.url.path == "/api/license/activate":
            # Une limite dédiée empêche de tester rapidement de nombreuses clés.
            scope, limit = "license-activation", 8
        elif request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            scope, limit = "mutation", 40
        elif request.url.path.startswith("/api/bunny/video-status/"):
            # Les contrôles d'encodage ont leur propre quota : ils ne doivent jamais
            # empêcher le catalogue, les messages ou les notifications de charger.
            scope, limit = "video-status", 60
        else:
            scope, limit = "read", 180
        try:
            await _enforce_rate_limit(request, scope, limit, 60)
        except HTTPException as exc:
            return FastAPIResponse(content='{"detail":"Trop de requêtes"}', status_code=429, media_type="application/json", headers=exc.headers)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response

# ---------- Storage (Cloudinary) ----------
import cloudinary
import cloudinary.uploader
# Le SDK se configure automatiquement via la variable d'env CLOUDINARY_URL
# (format: cloudinary://api_key:api_secret@cloud_name)
CLOUDINARY_CONFIGURED = bool(os.environ.get("CLOUDINARY_URL"))
if CLOUDINARY_CONFIGURED:
    cloudinary.config(secure=True)

# ---------- Hébergement des grosses vidéos ----------
BUNNY_LIBRARY_ID = os.environ.get("BUNNY_LIBRARY_ID")
BUNNY_API_KEY = os.environ.get("BUNNY_API_KEY")
# Clé distincte disponible côté hébergeur, section Token Authentication.
# Elle sert uniquement à signer des URLs de lecture temporaires et ne quitte jamais le backend.
BUNNY_TOKEN_AUTH_KEY = os.environ.get("BUNNY_TOKEN_AUTH_KEY")
BUNNY_CDN_HOST = os.environ.get("BUNNY_CDN_HOST")
BUNNY_CONFIGURED = bool(BUNNY_LIBRARY_ID and BUNNY_API_KEY)

# OMDb (données IMDb) — clé gratuite sur https://www.omdbapi.com/apikey.aspx
OMDB_API_KEY = os.environ.get("OMDB_API_KEY")

# TMDB — métadonnées et images officielles (clé gratuite)
# Accepte soit le jeton API Read Access (recommandé), soit la clé API v3.
TMDB_API_TOKEN = os.environ.get("TMDB_API_TOKEN")
TMDB_API_KEY = os.environ.get("TMDB_API_KEY")
TMDB_BASE_URL = "https://api.themoviedb.org/3"
TMDB_IMAGE_URL = "https://image.tmdb.org/t/p/original"

# La veille admin combine des signaux externes de sortie/tendance avec les
# fiches, notes et volumes de votes IMDb récupérés via OMDb. Elle ne consulte
# jamais le catalogue ni les visionnages YourMovie's.
IMDB_DISCOVERY_CACHE_TTL_SECONDS = 30 * 60
_imdb_discovery_cache = {
    "signals_expires_at": 0.0,
    "signals": {},
    "items_expires_at": 0.0,
    "items": [],
}

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
    profile_background_color: Optional[str] = None
    has_pin: bool = False

class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=2, max_length=40)
    ref: Optional[str] = Field(default=None, max_length=40)

class LoginInput(BaseModel):
    email: EmailStr
    password: str

class SessionExchangeInput(BaseModel):
    session_id: str

class TimelineEntry(BaseModel):
    media_id: Optional[str] = Field(default=None, max_length=80)
    tmdb_id: Optional[int] = None
    title: str = Field(min_length=1, max_length=200)
    type: Literal["movie", "series", "anime"] = "movie"
    year: Optional[int] = None
    release_date: Optional[str] = Field(default=None, max_length=20)
    poster_url: Optional[str] = Field(default=None, max_length=2048)


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
    bunny_library_id: Optional[str] = None  # bibliothèque Bunny associée à la vidéo
    qualities: List[dict] = []  # [{quality: "720p"|"1080p"|"4k", url: "https://...", file_path: "..."}]
    cast: List[str] = []
    director: Optional[str] = None
    country: Optional[str] = None
    rating: Optional[float] = None
    seasons: List[dict] = []
    tmdb_id: Optional[int] = None
    tmdb_kind: Optional[Literal["movie", "tv"]] = None
    saga_title: Optional[str] = Field(default=None, max_length=200)
    timeline: List[TimelineEntry] = Field(default_factory=list, max_length=30)
    featured: bool = False
    featured_order: Optional[int] = None
    in_theaters: bool = False
    player_broken: bool = False
    player_notice: Optional[str] = Field(default=None, max_length=300)

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
    bunny_library_id: Optional[str] = None
    qualities: Optional[List[dict]] = None
    cast: Optional[List[str]] = None
    director: Optional[str] = None
    country: Optional[str] = None
    rating: Optional[float] = None
    seasons: Optional[List[dict]] = None
    tmdb_id: Optional[int] = None
    tmdb_kind: Optional[Literal["movie", "tv"]] = None
    saga_title: Optional[str] = Field(default=None, max_length=200)
    timeline: Optional[List[TimelineEntry]] = Field(default=None, max_length=30)
    featured: Optional[bool] = None
    featured_order: Optional[int] = None
    in_theaters: Optional[bool] = None
    player_broken: Optional[bool] = None
    player_notice: Optional[str] = Field(default=None, max_length=300)

class MediaCreate(MediaBase):
    pass

class MediaOut(MediaBase):
    id: str
    created_at: str

class ReviewCreate(BaseModel):
    media_id: str = Field(min_length=1, max_length=80)
    rating: float = Field(..., ge=0, le=10)
    comment: str = Field(default="", max_length=2000)

class ReviewOut(BaseModel):
    id: str
    media_id: str
    user_id: str
    user_name: str
    rating: float
    comment: str
    created_at: str

class ReplyCreate(BaseModel):
    comment: str = Field(min_length=1, max_length=2000)

class ReviewEdit(BaseModel):
    rating: Optional[float] = Field(default=None, ge=0, le=10)
    comment: Optional[str] = Field(default=None, max_length=2000)

class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(default="", max_length=10000)

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

class LicenseActivationInput(BaseModel):
    key: str = Field(min_length=12, max_length=128)

class AdminLicenseKeysInput(BaseModel):
    keys: str = Field(min_length=1, max_length=1_000_000)
    plan: Literal["basic", "standard", "premium"]
    billing_cycle: Literal["monthly", "yearly"]

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

SESSION_TTL = timedelta(days=7)

def _token_fingerprint(jti: str) -> str:
    return hashlib.sha256(jti.encode()).hexdigest()

def _normalize_license_key(raw_key: str) -> str:
    key = (raw_key or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9-]{12,128}", key):
        raise HTTPException(status_code=422, detail="Format de clé invalide")
    return key

def _license_key_hash(raw_key: str) -> str:
    return hashlib.sha256(_normalize_license_key(raw_key).encode("utf-8")).hexdigest()

def _license_key_status(doc: dict) -> str:
    if doc.get("revoked_at"):
        return "revoked"
    if doc.get("redeemed_at"):
        return "redeemed"
    return "available"

def _license_key_admin_dict(doc: dict) -> dict:
    # Ne jamais renvoyer key_hash ou la clé d'origine au frontend.
    return {
        "id": doc.get("id"),
        "plan": doc.get("plan"),
        "duration_days": int(doc.get("duration_days", 0) or 0),
        "billing_cycle": doc.get("billing_cycle"),
        "status": _license_key_status(doc),
        "created_at": doc.get("created_at"),
        "redeemed_at": doc.get("redeemed_at"),
        "redeemed_until": doc.get("redeemed_until"),
        "revoked_at": doc.get("revoked_at"),
    }

async def _seed_license_keys() -> None:
    marker = await db.settings.find_one({"id": "license_key_seed"}, {"_id": 0, "version": 1})
    if marker and marker.get("version") == LICENSE_KEY_SEED_VERSION:
        return
    now = datetime.now(timezone.utc).isoformat()
    operations = []
    for key_hash, plan, duration_days, billing_cycle in LICENSE_KEY_SEED:
        operations.append(UpdateOne(
            {"key_hash": key_hash},
            {"$setOnInsert": {
                "id": f"lk_{key_hash[:24]}",
                "key_hash": key_hash,
                "plan": plan,
                "duration_days": duration_days,
                "billing_cycle": billing_cycle,
                "source": "initial_whitelist",
                "created_at": now,
                "redeemed_at": None,
                "revoked_at": None,
            }},
            upsert=True,
        ))
    if operations:
        await db.license_keys.bulk_write(operations, ordered=False)
    await db.settings.update_one(
        {"id": "license_key_seed"},
        {"$set": {"version": LICENSE_KEY_SEED_VERSION, "imported_at": now}},
        upsert=True,
    )

async def create_jwt(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    jti = secrets.token_urlsafe(32)
    payload = {
        "user_id": user_id,
        "jti": jti,
        "iat": now,
        "exp": now + SESSION_TTL,
    }
    await db.auth_sessions.insert_one({
        "jti_hash": _token_fingerprint(jti),
        "user_id": user_id,
        "created_at": now,
        "expires_at": now + SESSION_TTL,
        "revoked_at": None,
    })
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
            jti = payload.get("jti")
            if not jti:
                raise pyjwt.InvalidTokenError("legacy token")
            session = await db.auth_sessions.find_one({
                "jti_hash": _token_fingerprint(jti),
                "user_id": payload.get("user_id"),
                "revoked_at": None,
                "expires_at": {"$gt": datetime.now(timezone.utc)},
            })
            if not session:
                raise pyjwt.InvalidTokenError("revoked token")
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

ROLE_LEVEL = {"editor": 1, "moderator": 2, "super": 3}
def _is_superadmin_locked(user: dict) -> bool:
    return bool(user.get("account_identifier") and user.get("superadmin_locked"))

def _admin_role(user: dict):
    if _is_superadmin_locked(user):
        return "super"
    role = user.get("admin_role")
    if role in ROLE_LEVEL:
        return role
    return "editor" if user.get("is_admin") else None

def _admin_level(user: dict) -> int:
    """Palier hérité, désormais déduit des permissions effectives."""
    perms = _admin_perms(user)
    if not perms:
        return 0
    if perms >= set(ROLE_PRESETS["super"]):
        return 3
    if perms >= set(ROLE_PRESETS["moderator"]):
        return 2
    return 1

# ---------- Permissions admin (cochables individuellement) ----------
ALL_PERMS = [
    "content.add", "content.edit", "content.delete", "content.publish",
    "wishboard.view", "wishboard.approve", "wishboard.moderate",
    "users.view", "users.block", "users.edit", "users.delete", "users.premium", "users.coins",
    "reviews.moderate", "announcements.manage", "polls.manage",
    "pricing.manage", "ads.manage", "cagnotte.manage", "keys.manage",
    "roles.manage",
]

ROLE_PRESETS = {
    "editor": ["content.add", "wishboard.view", "wishboard.approve", "users.view"],
    "moderator": [
        "content.add", "content.edit", "content.publish",
        "wishboard.view", "wishboard.approve", "wishboard.moderate",
        "users.view", "users.block", "users.coins",
        "reviews.moderate", "announcements.manage", "polls.manage",
    ],
    "super": list(ALL_PERMS),
}

def _admin_perms(user: dict) -> set:
    """Permissions effectives. Les comptes créés avant ce système sont traduits
    à la volée depuis leur ancien rôle : aucune migration en base n'est requise."""
    if _is_superadmin_locked(user):
        return set(ALL_PERMS)
    stored = user.get("admin_perms")
    if isinstance(stored, list):
        return {p for p in stored if p in ALL_PERMS}
    role = user.get("admin_role")
    if role in ROLE_PRESETS:
        return set(ROLE_PRESETS[role])
    return set(ROLE_PRESETS["editor"]) if user.get("is_admin") else set()

def _peut_publier(user: dict) -> bool:
    """Publier directement, sans passer par la file de validation. Accorde aussi
    a qui peut supprimer du contenu : ces comptes existaient avant la file et ne
    doivent pas se retrouver soudainement en attente de leur propre validation."""
    return has_perm(user, "content.publish") or has_perm(user, "content.delete")


def has_perm(user: dict, perm: str) -> bool:
    return perm in _admin_perms(user)

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not _admin_perms(user):
        raise HTTPException(status_code=403, detail="Admin only")
    return user

def require_perm(perm: str):
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if not has_perm(user, perm):
            raise HTTPException(status_code=403, detail="Tu n'as pas la permission pour cette action.")
        return user
    return _dep

def require_level(n: int):
    """Conservé pour compatibilité : traduit le palier en permission équivalente."""
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if _admin_level(user) < n:
            raise HTTPException(status_code=403, detail="Permission insuffisante pour cette action")
        return user
    return _dep

async def get_optional_user(request: Request, authorization: Optional[str] = Header(None)) -> Optional[dict]:
    try:
        return await get_current_user(request, authorization)
    except HTTPException:
        return None

async def current_profile_id(x_profile_id: Optional[str] = Header(None, alias="X-Profile-Id")) -> Optional[str]:
    # profil actif (multi-profil premium) ; None = niveau compte / profil général
    return x_profile_id or None

ONLINE_WINDOW_SECONDS = 120
RATE_BUCKETS: dict = {}
RATE_LOCK = asyncio.Lock()

async def _enforce_rate_limit(request: Request, scope: str, limit: int, window_seconds: int) -> None:
    forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    client_ip = forwarded or (request.client.host if request.client else "unknown")
    key = f"{scope}:{client_ip}"
    now = time.monotonic()
    async with RATE_LOCK:
        attempts = [stamp for stamp in RATE_BUCKETS.get(key, []) if now - stamp < window_seconds]
        if len(attempts) >= limit:
            retry_after = max(1, int(window_seconds - (now - attempts[0])))
            raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez plus tard.", headers={"Retry-After": str(retry_after)})
        attempts.append(now)
        RATE_BUCKETS[key] = attempts

def _new_account_identifier() -> str:
    return f"YM-{secrets.token_hex(6).upper()}"

async def _allocate_account_identifier() -> str:
    for _ in range(20):
        candidate = _new_account_identifier()
        if not await db.users.find_one({"account_identifier": candidate}, {"_id": 1}):
            return candidate
    raise RuntimeError("Impossible de générer un identifiant de compte unique")

async def _migrate_account_identifiers() -> None:
    users = await db.users.find({}, {"_id": 0, "user_id": 1, "name": 1, "account_identifier": 1}).to_list(100000)
    for existing in users:
        updates = {}
        if not existing.get("account_identifier"):
            updates["account_identifier"] = await _allocate_account_identifier()
        if (existing.get("name") or "").strip().lower() == "lune27":
            updates.update({"is_admin": True, "admin_role": "super", "superadmin_locked": True})
        if updates:
            await db.users.update_one({"user_id": existing["user_id"]}, {"$set": updates})

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

PREMIUM_PLAN_LEVELS = {"basic": 1, "standard": 2, "premium": 3, "admin": 4}

def _active_premium_source(plan, until, source: str) -> Optional[dict]:
    if not plan or not until:
        return None
    try:
        dt = datetime.fromisoformat(until) if isinstance(until, str) else until
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt <= datetime.now(timezone.utc):
            return None
        return {"plan": plan, "until": dt.isoformat(), "source": source, "level": PREMIUM_PLAN_LEVELS.get(plan, 0)}
    except Exception:
        return None

def _effective_premium_entitlement(user: dict) -> Optional[dict]:
    """Return the best active entitlement without overwriting paid/coin premium."""
    sources = [
        _active_premium_source(user.get("premium_plan"), user.get("premium_until"), "account"),
        _active_premium_source(user.get("discord_premium_plan"), user.get("discord_premium_until"), "discord"),
    ]
    for entitlement in user.get("license_entitlements", []) or []:
        if not isinstance(entitlement, dict):
            continue
        sources.append(_active_premium_source(
            entitlement.get("plan"),
            entitlement.get("until"),
            "license",
        ))
    active = [source for source in sources if source]
    if not active:
        return None
    return max(active, key=lambda item: (item["level"], item["until"]))

def user_public_dict(user: dict) -> dict:
    entitlement = _effective_premium_entitlement(user)
    premium_active = entitlement is not None
    return {
        "user_id": user.get("user_id"),
        "account_identifier": user.get("account_identifier"),
        "email": user.get("email"),
        "name": user.get("name"),
        "picture": user.get("picture"),
        "banner": user.get("banner"),
        "is_admin": bool(_admin_perms(user)),
        "admin_role": _admin_role(user),
        "admin_level": _admin_level(user),
        "admin_perms": sorted(_admin_perms(user)),
        "superadmin_locked": _is_superadmin_locked(user),
        "auth_provider": user.get("auth_provider", "jwt"),
        "premium": premium_active,
        "premium_plan": entitlement["plan"] if entitlement else None,
        "premium_until": entitlement["until"] if entitlement else None,
        "premium_source": entitlement["source"] if entitlement else None,
        "bio": user.get("bio"),
        "preferred_quality": user.get("preferred_quality"),
        "autoplay_hero": user.get("autoplay_hero", True),
        "accent_color": user.get("accent_color") if premium_active else None,
        "profile_background_color": user.get("profile_background_color") if premium_active else None,
        "has_pin": bool(user.get("pin_hash")),
        "discord_linked": bool(user.get("discord_user_id")),
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
    return _effective_premium_entitlement(user) is not None

COIN_PLANS = {
    "basic": {"name": "Basic", "options": [
        {"days": 30, "coins": 1200},
        {"days": 60, "coins": 2250},
        {"days": 90, "coins": 3150},
    ]},
    "standard": {"name": "Standard", "options": [
        {"days": 30, "coins": 2800},
        {"days": 60, "coins": 5250},
        {"days": 90, "coins": 7350},
    ]},
    "premium": {"name": "Premium", "options": [
        {"days": 30, "coins": 6000},
        {"days": 60, "coins": 11250},
        {"days": 90, "coins": 15750},
    ]},
}

LEGACY_COIN_OPTIONS = {
    "basic": [{"days": 30, "coins": 800}, {"days": 60, "coins": 1500}, {"days": 90, "coins": 2100}],
    "standard": [{"days": 30, "coins": 2000}, {"days": 60, "coins": 3800}, {"days": 90, "coins": 5400}],
    "premium": [{"days": 30, "coins": 5000}, {"days": 60, "coins": 9500}, {"days": 90, "coins": 13500}],
}

LEGACY_PREMIUM_PRICES = {
    "basic": {"monthly": 4.99, "yearly": 47.88},
    "standard": {"monthly": 9.99, "yearly": 95.88},
    "premium": {"monthly": 16.99, "yearly": 163.08},
}

WELCOME_OFFER_HOURS = 24
WELCOME_OFFER_PCT = 50

async def _pricing_doc() -> dict:
    return await db.settings.find_one({"id": "pricing"}, {"_id": 0}) or {}

# ---------- Publicité (régie configurable depuis l'admin) ----------
REFERRAL_DEFAULTS = {
    "enabled": True,
    "coins_parrain": 50,
    "coins_filleul": 25,
}


async def _effective_referral() -> dict:
    doc = await db.settings.find_one({"id": "referral"}, {"_id": 0}) or {}
    config = dict(REFERRAL_DEFAULTS)
    config["enabled"] = bool(doc.get("enabled", config["enabled"]))
    for cle in ("coins_parrain", "coins_filleul"):
        valeur = doc.get(cle)
        if isinstance(valeur, (int, float)):
            config[cle] = max(0, min(1000, round(float(valeur), 1)))
    return config


async def _apply_referral(code: Optional[str], filleul: dict) -> None:
    """Credite le parrain et le filleul. Toute anomalie est silencieuse : une
    inscription ne doit jamais echouer a cause d'un code de parrainage."""
    propre = re.sub(r"[^A-Za-z0-9-]", "", str(code or "")).upper()
    if not propre:
        return
    try:
        config = await _effective_referral()
        if not config["enabled"]:
            return
        parrain = await db.users.find_one({"account_identifier": propre}, {"_id": 0, "user_id": 1, "name": 1})
        if not parrain or parrain["user_id"] == filleul["user_id"]:
            return
        deja = await db.referrals.find_one({"filleul_id": filleul["user_id"]}, {"_id": 1})
        if deja:
            return
        await db.referrals.insert_one({
            "parrain_id": parrain["user_id"],
            "filleul_id": filleul["user_id"],
            "filleul_name": filleul.get("name", ""),
            "coins_parrain": config["coins_parrain"],
            "coins_filleul": config["coins_filleul"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.users.update_one({"user_id": filleul["user_id"]}, {"$set": {"referred_by": parrain["user_id"]}})
        if config["coins_parrain"]:
            await award_coins(
                parrain["user_id"], config["coins_parrain"],
                "Parrainage réussi",
                f"{filleul.get('name', 'Un nouveau membre')} vient de s'inscrire avec ton lien.",
            )
        if config["coins_filleul"]:
            await award_coins(
                filleul["user_id"], config["coins_filleul"],
                "Bienvenue !",
                f"Tu as rejoint YourMovie's grâce à {parrain.get('name', 'un membre')}.",
            )
    except Exception as exc:
        logger.error("Parrainage impossible pour %s : %s", filleul.get("user_id"), exc)


ADS_DEFAULTS = {
    "enabled": False,
    "preroll": {"enabled": False, "vast_tag_url": "", "duration": 15, "skip_after": 5, "frequency_minutes": 30},
    "banner": {"enabled": False, "script_url": ""},
    "popunder": {"enabled": False, "script_url": "", "frequency_hours": 12},
    "gate": {"enabled": False, "steps": 1, "seconds": 3, "frequency_minutes": 60, "direct_link": ""},
    "reward": {"enabled": False, "coins": 1, "watch_seconds": 20, "cooldown_minutes": 10, "daily_max": 10},
    "campaigns": [],
}

def _https_url(value) -> str:
    """URL https uniquement. Les tags de régie fournis en protocole-relatif
    (//exemple.com/invoke.js) sont normalisés en https."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.startswith("//"):
        raw = f"https:{raw}"
    return raw if raw.startswith("https://") else ""

def _clamp_num(value, low, high, default):
    try:
        return max(low, min(high, float(value)))
    except (TypeError, ValueError):
        return default

def _clean_campaign(entry, index: int):
    if not isinstance(entry, dict):
        return None
    url = _https_url(entry.get("url"))
    if not url or entry.get("enabled") is False:
        return None
    duration = _clamp_num(entry.get("duration"), 5, 60, 10)
    return {
        "id": str(entry.get("id") or f"campaign-{index}"),
        "title": str(entry.get("title") or "Découvrir l'offre")[:120],
        "description": str(entry.get("description") or "")[:300],
        "cta": str(entry.get("cta") or "En savoir plus")[:60],
        "advertiser": str(entry.get("advertiser") or "Partenaire")[:60],
        "url": url,
        "imageUrl": _https_url(entry.get("imageUrl")),
        "duration": int(duration),
        "skipAfter": int(_clamp_num(entry.get("skipAfter"), 0, duration, 5)),
        "enabled": True,
    }

async def _effective_ads() -> dict:
    doc = await db.settings.find_one({"id": "ads"}, {"_id": 0}) or {}
    pre = {**ADS_DEFAULTS["preroll"], **(doc.get("preroll") or {})}
    ban = {**ADS_DEFAULTS["banner"], **(doc.get("banner") or {})}
    pop = {**ADS_DEFAULTS["popunder"], **(doc.get("popunder") or {})}
    gate = {**ADS_DEFAULTS["gate"], **(doc.get("gate") or {})}
    reward = {**ADS_DEFAULTS["reward"], **(doc.get("reward") or {})}
    campaigns = [c for c in (
        _clean_campaign(entry, i) for i, entry in enumerate(doc.get("campaigns") or [])
    ) if c]
    duration = int(_clamp_num(pre.get("duration"), 5, 60, 15))
    return {
        "enabled": bool(doc.get("enabled", ADS_DEFAULTS["enabled"])),
        "preroll": {
            "enabled": bool(pre.get("enabled")),
            "vast_tag_url": _https_url(pre.get("vast_tag_url")),
            "duration": duration,
            "skip_after": int(_clamp_num(pre.get("skip_after"), 0, duration, 5)),
            "frequency_minutes": int(_clamp_num(pre.get("frequency_minutes"), 0, 1440, 30)),
        },
        "banner": {"enabled": bool(ban.get("enabled")), "script_url": _https_url(ban.get("script_url"))},
        "popunder": {
            "enabled": bool(pop.get("enabled")),
            "script_url": _https_url(pop.get("script_url")),
            "frequency_hours": int(_clamp_num(pop.get("frequency_hours"), 1, 168, 12)),
        },
        "gate": {
            "enabled": bool(gate.get("enabled")),
            "steps": int(_clamp_num(gate.get("steps"), 1, 5, 1)),
            "seconds": int(_clamp_num(gate.get("seconds"), 0, 15, 3)),
            "frequency_minutes": int(_clamp_num(gate.get("frequency_minutes"), 0, 1440, 60)),
            "direct_link": _https_url(gate.get("direct_link")),
        },
        "reward": {
            "enabled": bool(reward.get("enabled")),
            "coins": round(_clamp_num(reward.get("coins"), 0.5, 50, 1), 1),
            "watch_seconds": int(_clamp_num(reward.get("watch_seconds"), 5, 120, 20)),
            "cooldown_minutes": int(_clamp_num(reward.get("cooldown_minutes"), 0, 1440, 10)),
            "daily_max": int(_clamp_num(reward.get("daily_max"), 1, 100, 10)),
        },
        "campaigns": campaigns,
    }

async def _migrate_coin_economy_v2() -> None:
    """Replace only untouched legacy defaults; preserve intentional admin prices."""
    doc = await _pricing_doc()
    if int(doc.get("coin_economy_version", 0) or 0) >= 2:
        return
    overrides = doc.get("coins")
    update = {"$set": {"coin_economy_version": 2}}
    if not overrides or overrides == LEGACY_COIN_OPTIONS:
        update["$unset"] = {"coins": ""}
    else:
        logger.info("Tarifs Freemium personnalisés conservés pendant la migration v2.")
    await db.settings.update_one({"id": "pricing"}, update, upsert=True)

async def _migrate_premium_pricing_v3() -> None:
    """Applique les nouveaux prix seulement si les anciens tarifs n'ont pas été personnalisés."""
    doc = await _pricing_doc()
    if int(doc.get("premium_pricing_version", 0) or 0) >= 3:
        return
    overrides = doc.get("premium")
    update = {"$set": {"premium_pricing_version": 3}}
    if not overrides or overrides == LEGACY_PREMIUM_PRICES:
        update["$unset"] = {"premium": ""}
    else:
        logger.info("Tarifs Premium personnalisés conservés pendant la migration v3.")
    await db.settings.update_one({"id": "pricing"}, update, upsert=True)

async def _effective_plans() -> list:
    doc = await _pricing_doc()
    overrides = doc.get("premium") or {}
    plans = []
    for p in PLANS:
        ov = overrides.get(p["id"]) or {}
        prices = {}
        for interval, pr in p["prices"].items():
            amount = pr["amount"]
            if interval in ov:
                try:
                    amount = round(float(ov[interval]), 2)
                except Exception:
                    pass
            prices[interval] = {**pr, "amount": amount}
        plans.append({**p, "prices": prices})
    return plans

async def _effective_coin_plans() -> dict:
    doc = await _pricing_doc()
    overrides = doc.get("coins") or {}
    result = {}
    for pid, base in COIN_PLANS.items():
        opts = overrides.get(pid)
        clean = []
        if isinstance(opts, list):
            for o in opts:
                try:
                    clean.append({"days": int(o["days"]), "coins": int(round(float(o["coins"])))})
                except Exception:
                    pass
        result[pid] = {"name": base["name"], "options": clean or base["options"]}
    return result

async def _welcome_config() -> dict:
    doc = await _pricing_doc()
    w = doc.get("welcome") or {}
    return {
        "pct": float(w.get("pct", WELCOME_OFFER_PCT)),
        "hours": float(w.get("hours", WELCOME_OFFER_HOURS)),
        "enabled": bool(w.get("enabled", True)),
    }

async def _welcome_offer(user: dict) -> dict:
    cfg = await _welcome_config()
    created = user.get("created_at")
    active, ends_at = False, None
    if cfg["enabled"] and created:
        try:
            dt = datetime.fromisoformat(created) if isinstance(created, str) else created
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            end = dt + timedelta(hours=cfg["hours"])
            active = datetime.now(timezone.utc) < end
            ends_at = end.isoformat()
        except Exception:
            pass
    return {"active": active, "ends_at": ends_at if active else None, "pct": cfg["pct"]}

def _offer_price(cost, offer) -> int:
    if offer and offer.get("active"):
        return int(round(cost * (1 - offer.get("pct", 0) / 100)))
    return int(cost)

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

async def award_coins(user_id: str, amount: float, title: str, body: str = "", notify: bool = True) -> float:
    amount = round(float(amount), 1)
    res = await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$inc": {"coins": amount}},
        return_document=True,
    )
    new_balance = round(float((res or {}).get("coins", 0) or 0), 1) if res else 0
    if notify:
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

COMMENT_COOLDOWN_SECONDS = 180

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
async def register(inp: RegisterInput, request: Request):
    await _enforce_rate_limit(request, "register", 5, 3600)
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")
    name = (inp.name or "").strip()
    name_clash = await db.users.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}, {"_id": 0, "user_id": 1})
    if name_clash:
        raise HTTPException(status_code=400, detail="Ce pseudo est déjà pris.")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "account_identifier": await _allocate_account_identifier(),
        "email": inp.email.lower(),
        "name": name,
        "password_hash": hash_password(inp.password),
        "picture": None,
        "is_admin": False,
        "auth_provider": "jwt",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        # course entre deux inscriptions simultanées sur le même email
        raise HTTPException(status_code=400, detail="Email already registered")
    await _apply_referral(inp.ref, doc)
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0}) or doc
    token = await create_jwt(user_id)
    return {"token": token, "user": user_public_dict(doc)}

@api_router.post("/auth/login")
async def login(inp: LoginInput, request: Request):
    await _enforce_rate_limit(request, "login", 10, 900)
    user = await db.users.find_one({"email": inp.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(inp.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.get("blocked_at"):
        raise HTTPException(status_code=403, detail="Votre compte a été bloqué. Contactez le support.")
    token = await create_jwt(user["user_id"])
    return {"token": token, "user": user_public_dict(user)}

class GoogleAuthInput(BaseModel):
    credential: str
    ref: Optional[str] = Field(default=None, max_length=40)

@api_router.post("/auth/google")
async def auth_google(inp: GoogleAuthInput, request: Request):
    await _enforce_rate_limit(request, "google-login", 20, 900)
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
        name = await _unique_name(name)
        await db.users.insert_one({
            "user_id": user_id,
            "account_identifier": await _allocate_account_identifier(),
            "email": email,
            "name": name,
            "picture": picture,
            "is_admin": False,
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        nouveau_compte = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if nouveau_compte:
            await _apply_referral(inp.ref, nouveau_compte)
    user = await get_user_by_id(user_id)
    if user.get("blocked_at"):
        raise HTTPException(status_code=403, detail="Votre compte a été bloqué. Contactez le support.")
    token = await create_jwt(user_id)
    return {"token": token, "user": user_public_dict(user)}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_public_dict(user)

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response, authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        try:
            payload = pyjwt.decode(authorization.split(" ", 1)[1], JWT_SECRET, algorithms=[JWT_ALGO], options={"verify_exp": False})
            if payload.get("jti"):
                await db.auth_sessions.update_one(
                    {"jti_hash": _token_fingerprint(payload["jti"]), "user_id": payload.get("user_id")},
                    {"$set": {"revoked_at": datetime.now(timezone.utc)}},
                )
        except Exception:
            pass
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
        "bunny_library_id": doc.get("bunny_library_id"),
        "qualities": doc.get("qualities", []),
        "title_logo_url": doc.get("title_logo_url"),
        "age_rating": doc.get("age_rating"),
        "cast": doc.get("cast", []),
        "director": doc.get("director"),
        "country": doc.get("country"),
        "rating": doc.get("rating"),
        "seasons": doc.get("seasons", []),
        "tmdb_id": doc.get("tmdb_id"),
        "tmdb_kind": doc.get("tmdb_kind"),
        "saga_title": doc.get("saga_title"),
        "timeline": doc.get("timeline", []),
        "featured": doc.get("featured", False),
        "featured_order": doc.get("featured_order"),
        "in_theaters": doc.get("in_theaters", False),
        "player_broken": doc.get("player_broken", False),
        "player_notice": doc.get("player_notice") or "",
        "created_at": doc.get("created_at", ""),
    }


def _catalog_history_key(doc: dict) -> str:
    if doc.get("tmdb_id") is not None:
        kind = doc.get("tmdb_kind") or ("movie" if doc.get("type") == "movie" else "tv")
        return f"tmdb:{kind}:{doc['tmdb_id']}"
    return ":".join([
        "title",
        _timeline_title_key(doc.get("title")),
        str(doc.get("year") or ""),
        str(doc.get("type") or "movie"),
    ])


async def _record_catalog_history(doc: dict, *, active: bool, user_id: Optional[str]) -> None:
    now = datetime.now(timezone.utc)
    history_key = _catalog_history_key(doc)
    common = {
        "history_key": history_key,
        "title": doc.get("title", ""),
        "type": doc.get("type", "movie"),
        "year": doc.get("year"),
        "tmdb_id": doc.get("tmdb_id"),
        "tmdb_kind": doc.get("tmdb_kind"),
        "poster_url": doc.get("poster_url"),
        "active": active,
        "updated_at": now,
    }
    if active:
        common.update({
            "current_media_id": doc.get("id"),
            "last_added_at": now,
            "deleted_at": None,
            "deleted_by": None,
        })
        await db.media_catalog_history.update_one(
            {"history_key": history_key},
            {"$set": common, "$setOnInsert": {"first_added_at": now, "first_added_by": user_id}},
            upsert=True,
        )
    else:
        common.update({
            "current_media_id": None,
            "deleted_at": now,
            "deleted_by": user_id,
        })
        await db.media_catalog_history.update_one(
            {"history_key": history_key},
            {"$set": common, "$setOnInsert": {"first_added_at": doc.get("created_at") or now}},
            upsert=True,
        )


async def _record_media_event(action: Literal["added", "deleted"], doc: dict, *, user_id: Optional[str]) -> None:
    await db.media_events.insert_one({
        "event_id": f"media_evt_{uuid.uuid4().hex}",
        "action": action,
        "media": {
            "id": doc.get("id"),
            "title": doc.get("title", ""),
            "type": doc.get("type", "movie"),
            "year": doc.get("year"),
            "poster_url": doc.get("poster_url"),
            "tmdb_id": doc.get("tmdb_id"),
        },
        "created_at": datetime.now(timezone.utc),
        "created_by": user_id,
    })

@api_router.get("/media")
async def list_media(type: Optional[str] = None, q: Optional[str] = None, featured: Optional[bool] = None, limit: int = 100):
    query = {}
    if type:
        query["type"] = type
    if q:
        query["title"] = {"$regex": re.escape(q), "$options": "i"}
    if featured is not None:
        query["featured"] = featured
    if featured is True:
        docs = await db.media.find(query, {"_id": 0}).to_list(max(limit, 500))
        docs.sort(key=lambda doc: (
            doc.get("featured_order") is None,
            int(doc.get("featured_order") or 10**9),
            doc.get("created_at") or "",
        ))
        docs = docs[:limit]
    else:
        docs = await db.media.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [serialize_media(d) for d in docs]

@api_router.get("/media/{media_id}")
async def get_media(media_id: str, user: Optional[dict] = Depends(get_optional_user)):
    doc = await db.media.find_one({"id": media_id}, {"_id": 0})
    if not doc and user and has_perm(user, "content.add"):
        # Les propositions vivent dans une collection a part : le catalogue
        # public ne peut donc jamais en laisser filtrer une.
        doc = await db.media_pending.find_one({"id": media_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return serialize_media(doc)


def _timeline_title_key(value: Optional[str]) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    normalized = "".join(char for char in normalized if not unicodedata.combining(char)).lower()
    return re.sub(r"[^a-z0-9]+", " ", normalized).strip()


async def _resolve_timeline_items(media_id: str, raw_items: List[dict]) -> List[dict]:
    items = [dict(item) for item in (raw_items or [])[:30] if isinstance(item, dict) and item.get("title")]
    if len(items) < 2:
        return []

    media_ids = [item.get("media_id") for item in items if item.get("media_id")]
    tmdb_ids = [item.get("tmdb_id") for item in items if item.get("tmdb_id") is not None]
    titles = [item.get("title") for item in items if item.get("title")]
    clauses = []
    if media_ids:
        clauses.append({"id": {"$in": media_ids}})
    if tmdb_ids:
        clauses.append({"tmdb_id": {"$in": tmdb_ids}})
    if titles:
        clauses.append({"title": {"$in": titles}})
    catalog = []
    if clauses:
        catalog = await db.media.find(
            {"$or": clauses},
            {"_id": 0, "id": 1, "tmdb_id": 1, "title": 1, "type": 1, "year": 1, "poster_url": 1},
        ).to_list(200)

    by_id = {entry.get("id"): entry for entry in catalog if entry.get("id")}
    by_tmdb = {entry.get("tmdb_id"): entry for entry in catalog if entry.get("tmdb_id") is not None}
    by_title = {_timeline_title_key(entry.get("title")): entry for entry in catalog if entry.get("title")}
    resolved = []
    for position, item in enumerate(items, start=1):
        match = (
            by_id.get(item.get("media_id"))
            or by_tmdb.get(item.get("tmdb_id"))
            or by_title.get(_timeline_title_key(item.get("title")))
        )
        resolved.append({
            **item,
            "position": position,
            "media_id": match.get("id") if match else None,
            "available": bool(match),
            "current": bool(match and match.get("id") == media_id),
            "poster_url": (match or {}).get("poster_url") or item.get("poster_url"),
            "year": item.get("year") or (match or {}).get("year"),
        })
    return resolved


@api_router.get("/media/{media_id}/timeline")
async def get_media_timeline(media_id: str):
    doc = await db.media.find_one({"id": media_id}, {"_id": 0, "id": 1, "title": 1, "saga_title": 1, "timeline": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    items = await _resolve_timeline_items(media_id, doc.get("timeline", []))
    return {
        "title": doc.get("saga_title") or f"Univers {doc.get('title', '')}".strip(),
        "items": items,
    }

@api_router.post("/media")
async def create_media(m: MediaCreate, user: dict = Depends(require_perm("content.add"))):
    media_id = f"m_{uuid.uuid4().hex[:12]}"
    doc = m.model_dump()
    doc["id"] = media_id
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_by"] = user.get("user_id")
    if not _peut_publier(user):
        doc["proposed_by_name"] = user.get("name", "")
        await db.media_pending.insert_one(dict(doc))
        return {**serialize_media(doc), "pending": True}
    await db.media.insert_one(doc)
    try:
        await _record_catalog_history(doc, active=True, user_id=user.get("user_id"))
        await _record_media_event("added", doc, user_id=user.get("user_id"))
    except Exception as exc:
        logger.error("Journalisation de l'ajout du média %s impossible : %s", media_id, exc)
    return serialize_media(doc)

@api_router.put("/media/{media_id}")
async def update_media(media_id: str, m: MediaUpdate, user: dict = Depends(require_perm("content.edit"))):
    doc = {k: v for k, v in m.model_dump(exclude_unset=True).items()}
    if not doc:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.media.update_one({"id": media_id}, {"$set": doc})
    if result.matched_count == 0:
        en_attente = await db.media_pending.update_one({"id": media_id}, {"$set": doc})
        if en_attente.matched_count:
            fresh = await db.media_pending.find_one({"id": media_id}, {"_id": 0})
            return serialize_media(fresh)
        raise HTTPException(status_code=404, detail="Not found")
    fresh = await db.media.find_one({"id": media_id}, {"_id": 0})
    return serialize_media(fresh)

class AdminMediaFlagsInput(BaseModel):
    featured: Optional[bool] = None
    featured_order: Optional[int] = Field(default=None, ge=1, le=999)
    in_theaters: Optional[bool] = None
    player_broken: Optional[bool] = None
    player_notice: Optional[str] = Field(default=None, max_length=300)

@api_router.patch("/admin/media/{media_id}/flags")
async def update_admin_media_flags(media_id: str, flags: AdminMediaFlagsInput, user: dict = Depends(require_perm("content.edit"))):
    changes = flags.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Aucun statut à modifier")

    current = await db.media.find_one({"id": media_id}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Contenu introuvable")

    will_be_featured = changes.get("featured", current.get("featured", False))
    if "featured_order" in changes and not will_be_featured:
        raise HTTPException(status_code=400, detail="Activez d’abord le contenu « À l’affiche »")

    if changes.get("featured") is True and current.get("featured_order") is None and "featured_order" not in changes:
        highest = await db.media.find_one(
            {"featured": True, "featured_order": {"$ne": None}},
            {"_id": 0, "featured_order": 1},
            sort=[("featured_order", -1)],
        )
        changes["featured_order"] = int((highest or {}).get("featured_order") or 0) + 1
    elif changes.get("featured") is False:
        changes["featured_order"] = None

    await db.media.update_one({"id": media_id}, {"$set": changes})
    fresh = await db.media.find_one({"id": media_id}, {"_id": 0})
    return serialize_media(fresh)

@api_router.delete("/media/{media_id}")
async def delete_media(media_id: str, user: dict = Depends(require_perm("content.delete"))):
    media = await db.media.find_one({"id": media_id}, {"_id": 0})
    if not media:
        proposition = await db.media_pending.find_one({"id": media_id}, {"_id": 0})
        if proposition:
            await db.media_pending.delete_one({"id": media_id})
            return {"ok": True, "bunny_deleted": await _purge_bunny_of(proposition)}
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    await db.media.delete_one({"id": media_id})
    await db.reviews.delete_many({"media_id": media_id})
    await db.favorites.delete_many({"media_id": media_id})
    # Sans cela, chaque contenu supprimé laissait ses fichiers chez l'hébergeur
    # indéfiniment, facturés et invisibles depuis le panel.
    videos_supprimees = await _purge_bunny_of(media)
    try:
        await _record_catalog_history(media, active=False, user_id=user.get("user_id"))
        await _record_media_event("deleted", media, user_id=user.get("user_id"))
    except Exception as exc:
        logger.error("Journalisation de la suppression du média %s impossible : %s", media_id, exc)
    return {"ok": True, "bunny_deleted": videos_supprimees}

@api_router.get("/admin/bunny/views")
async def admin_bunny_views(
    library_id: Optional[str] = Query(None),
    user: dict = Depends(require_perm("content.add")),
):
    """Vues comptees par l'hebergeur video, regroupees par contenu du catalogue.
    Pour une serie, on additionne les vues de chacun de ses episodes."""
    if not BUNNY_CONFIGURED:
        raise HTTPException(status_code=500, detail="Hébergeur vidéo non configuré")
    library = _validated_bunny_library_id(library_id)
    videos = await _bunny_library_videos(library)
    par_guid = {str(v.get("guid")): v for v in videos if v.get("guid")}

    docs = await db.media.find(
        {}, {"_id": 0, "id": 1, "title": 1, "type": 1, "poster_url": 1, "bunny_video_id": 1, "bunny_library_id": 1, "seasons": 1},
    ).to_list(100000)

    items = []
    total = 0
    rattachees = set()
    for doc in docs:
        vues, comptees, meilleur = 0, 0, None
        for video_id, _ in _bunny_references_of(doc):
            video = par_guid.get(video_id)
            if not video:
                continue
            rattachees.add(video_id)
            comptees += 1
            n = int(video.get("views") or 0)
            vues += n
            if meilleur is None or n > meilleur["views"]:
                meilleur = {"title": video.get("title") or "", "views": n}
        if comptees == 0:
            continue
        total += vues
        items.append({
            "id": doc["id"],
            "title": doc.get("title", ""),
            "type": doc.get("type", "movie"),
            "poster_url": doc.get("poster_url"),
            "views": vues,
            "videos": comptees,
            "best": meilleur if doc.get("type") != "movie" else None,
        })

    items.sort(key=lambda e: e["views"], reverse=True)
    hors_catalogue = sum(int(v.get("views") or 0) for k, v in par_guid.items() if k not in rattachees)
    return {
        "library_id": library,
        "total_views": total,
        "unlinked_views": hors_catalogue,
        "items": items,
    }


@api_router.get("/admin/bunny/orphans")
async def admin_bunny_orphans(
    library_id: Optional[str] = Query(None),
    user: dict = Depends(require_perm("content.delete")),
):
    """Vidéos présentes chez l'hébergeur mais rattachées à aucun contenu du catalogue."""
    if not BUNNY_CONFIGURED:
        raise HTTPException(status_code=500, detail="Hébergeur vidéo non configuré")
    library = _validated_bunny_library_id(library_id)
    videos = await _bunny_library_videos(library)
    utilises = await _referenced_bunny_ids()
    orphelines = []
    octets = 0
    for video in videos:
        guid = str(video.get("guid") or "")
        if not guid or guid in utilises:
            continue
        taille = int(video.get("storageSize") or 0)
        octets += taille
        orphelines.append({
            "video_id": guid,
            "title": video.get("title") or "Sans titre",
            "created_at": video.get("dateUploaded"),
            "size_bytes": taille,
            "length_seconds": video.get("length"),
        })
    orphelines.sort(key=lambda v: v.get("created_at") or "")
    return {
        "library_id": library,
        "total_videos": len(videos),
        "orphans": orphelines,
        "orphan_bytes": octets,
    }


class BunnyPurgeInput(BaseModel):
    video_ids: List[str] = Field(default_factory=list, max_length=2000)
    library_id: Optional[str] = None


@api_router.post("/admin/bunny/orphans/purge")
async def admin_bunny_purge(
    inp: BunnyPurgeInput,
    user: dict = Depends(require_perm("content.delete")),
):
    if not BUNNY_CONFIGURED:
        raise HTTPException(status_code=500, detail="Hébergeur vidéo non configuré")
    library = _validated_bunny_library_id(inp.library_id)
    # On revérifie côté serveur : une vidéo redevenue utilisée entre l'analyse
    # et la confirmation ne doit jamais être supprimée.
    utilises = await _referenced_bunny_ids()
    a_traiter = []
    ignorees = 0
    for video_id in inp.video_ids:
        propre = str(video_id or "").strip()
        if not propre or propre in utilises:
            ignorees += 1
        else:
            a_traiter.append(propre)

    # Par paquets plutôt qu'une par une : sur plusieurs centaines de vidéos, la
    # boucle séquentielle tenait la requête ouverte une à deux minutes.
    supprimees = 0
    for depart in range(0, len(a_traiter), 8):
        lot = a_traiter[depart:depart + 8]
        resultats = await asyncio.gather(
            *(_delete_bunny_video(video_id, library) for video_id in lot),
            return_exceptions=True,
        )
        for resultat in resultats:
            if resultat is True:
                supprimees += 1
            else:
                ignorees += 1
    logger.info("Purge hébergeur par %s : %s supprimées, %s ignorées", user.get("user_id"), supprimees, ignorees)
    return {"deleted": supprimees, "skipped": ignorees}


@api_router.get("/admin/pending")
async def admin_list_pending(user: dict = Depends(require_perm("content.add"))):
    docs = await db.media_pending.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [serialize_media(doc) | {
        "proposed_by_name": doc.get("proposed_by_name") or "",
        "created_by": doc.get("created_by"),
    } for doc in docs]


@api_router.post("/admin/pending/{media_id}/publish")
async def admin_publish_pending(media_id: str, user: dict = Depends(require_perm("content.publish"))):
    doc = await db.media_pending.find_one({"id": media_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Proposition introuvable")
    doc.pop("proposed_by_name", None)
    doc["published_at"] = datetime.now(timezone.utc).isoformat()
    doc["published_by"] = user.get("user_id")
    await db.media.insert_one(dict(doc))
    await db.media_pending.delete_one({"id": media_id})
    try:
        await _record_catalog_history(doc, active=True, user_id=doc.get("created_by"))
        await _record_media_event("added", doc, user_id=doc.get("created_by"))
    except Exception as exc:
        logger.error("Journalisation de la publication de %s impossible : %s", media_id, exc)
    return serialize_media(doc)


@api_router.delete("/admin/pending/{media_id}")
async def admin_reject_pending(media_id: str, user: dict = Depends(require_perm("content.publish"))):
    doc = await db.media_pending.find_one({"id": media_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Proposition introuvable")
    await db.media_pending.delete_one({"id": media_id})
    # Les fichiers ont bien ete televerses chez l'hebergeur : les laisser reviendrait a
    # payer le stockage d'une proposition refusee.
    supprimees = await _purge_bunny_of(doc)
    logger.info("Proposition %s refusee par %s (%s videos supprimees)", media_id, user.get("user_id"), supprimees)
    return {"ok": True, "bunny_deleted": supprimees}


@api_router.get("/admin/contributors")
async def admin_contributors(user: dict = Depends(require_perm("content.add"))):
    """Qui a ajoute quoi : reconstruit depuis le journal deja tenu a chaque ajout."""
    evenements = await db.media_events.find(
        {"action": "added", "created_by": {"$ne": None}},
        {"_id": 0, "created_by": 1, "created_at": 1, "media": 1},
    ).to_list(100000)
    par_personne = {}
    for evenement in evenements:
        identifiant = evenement.get("created_by")
        entree = par_personne.setdefault(identifiant, {"user_id": identifiant, "total": 0, "dernier": None, "derniers_titres": []})
        entree["total"] += 1
        quand = evenement.get("created_at")
        horodatage = quand.isoformat() if hasattr(quand, "isoformat") else str(quand or "")
        if not entree["dernier"] or horodatage > entree["dernier"]:
            entree["dernier"] = horodatage
        if len(entree["derniers_titres"]) < 5:
            entree["derniers_titres"].append((evenement.get("media") or {}).get("title", ""))

    en_attente = await db.media_pending.find({}, {"_id": 0, "created_by": 1}).to_list(1000)
    for proposition in en_attente:
        identifiant = proposition.get("created_by")
        if identifiant:
            entree = par_personne.setdefault(identifiant, {"user_id": identifiant, "total": 0, "dernier": None, "derniers_titres": []})
            entree["en_attente"] = entree.get("en_attente", 0) + 1

    comptes = await db.users.find(
        {"user_id": {"$in": [i for i in par_personne if i]}},
        {"_id": 0, "user_id": 1, "name": 1, "avatar_url": 1},
    ).to_list(1000)
    noms = {c["user_id"]: c for c in comptes}
    sortie = []
    for identifiant, entree in par_personne.items():
        compte = noms.get(identifiant) or {}
        sortie.append({
            **entree,
            "en_attente": entree.get("en_attente", 0),
            "name": compte.get("name") or "Compte supprimé",
            "avatar_url": compte.get("avatar_url"),
        })
    sortie.sort(key=lambda e: e["total"], reverse=True)
    return sortie


# ---------- Trending / Genres ----------
@api_router.get("/trending")
async def trending(limit: int = 10):
    limit = max(1, min(limit, 30))
    agg = await db.watch_progress.aggregate([
        {"$group": {"_id": "$media_id", "views": {"$sum": 1}}},
        {"$sort": {"views": -1}},
        {"$limit": limit * 3},
    ]).to_list(limit * 3)
    views_map = {a["_id"]: a["views"] for a in agg if a.get("_id")}
    ordered_ids = [a["_id"] for a in agg if a.get("_id")]
    result, seen = [], set()
    if ordered_ids:
        docs = await db.media.find({"id": {"$in": ordered_ids}}, {"_id": 0}).to_list(len(ordered_ids))
        by_id = {d["id"]: d for d in docs}
        for mid in ordered_ids:
            d = by_id.get(mid)
            if d:
                item = serialize_media(d)
                item["view_count"] = views_map.get(mid, 0)
                result.append(item)
                seen.add(mid)
            if len(result) >= limit:
                break
    if len(result) < limit:
        extra = await db.media.find({"id": {"$nin": list(seen)}}, {"_id": 0}).sort([("rating", -1), ("created_at", -1)]).to_list(limit - len(result))
        for d in extra:
            item = serialize_media(d)
            item["view_count"] = views_map.get(d["id"], 0)
            result.append(item)
    return result[:limit]


def _omdb_discovery_details(imdb_id: str) -> dict:
    if not OMDB_API_KEY:
        raise HTTPException(status_code=503, detail="Veille IMDb non configurée (clé OMDb manquante).")
    response = requests.get(
        "https://www.omdbapi.com/",
        params={"apikey": OMDB_API_KEY, "i": imdb_id, "plot": "short"},
        timeout=15,
    )
    response.raise_for_status()
    data = response.json()
    return data if data.get("Response") != "False" else {}


async def _get_imdb_discovery_signals() -> dict:
    now_tick = time.monotonic()
    if _imdb_discovery_cache["signals_expires_at"] > now_tick:
        return _imdb_discovery_cache["signals"]

    if not (TMDB_API_TOKEN or TMDB_API_KEY):
        raise HTTPException(status_code=503, detail="Les signaux externes de sorties et tendances ne sont pas configurés.")

    sources = [
        ("/trending/all/week", {"language": "fr-FR"}, None, "trending", 120),
        ("/movie/now_playing", {"language": "fr-FR", "region": "FR", "page": 1}, "movie", "new", 135),
        ("/tv/on_the_air", {"language": "fr-FR", "page": 1}, "tv", "new", 125),
    ]
    responses = await asyncio.gather(*[
        run_in_threadpool(_tmdb_request, path, params)
        for path, params, _, _, _ in sources
    ], return_exceptions=True)

    signals = {}
    for response, (_, _, forced_kind, tag, base_score) in zip(responses, sources):
        if not isinstance(response, dict):
            logger.warning("Signal externe de veille indisponible : %s", response)
            continue
        for position, item in enumerate((response.get("results") or [])[:30]):
            tmdb_id = item.get("id")
            media_kind = forced_kind or item.get("media_type")
            if media_kind not in {"movie", "tv"} or tmdb_id is None:
                continue
            key = f"{media_kind}:{tmdb_id}"
            signal = signals.setdefault(key, {
                "tmdb_id": tmdb_id,
                "tmdb_kind": media_kind,
                "title": item.get("title") or item.get("name") or "",
                "poster_url": _tmdb_image(item.get("poster_path")),
                "score": 0.0,
                "tags": set(),
                "release_date": None,
            })
            signal["score"] += max(10, base_score - position * 3)
            signal["tags"].add(tag)
            release_date = item.get("release_date") or item.get("first_air_date")
            if release_date and not signal["release_date"]:
                signal["release_date"] = release_date

    for signal in signals.values():
        signal["tags"] = sorted(signal["tags"])
    _imdb_discovery_cache.update({
        "signals_expires_at": now_tick + IMDB_DISCOVERY_CACHE_TTL_SECONDS,
        "signals": signals,
    })
    return signals


async def _resolve_imdb_discovery_item(signal: dict) -> Optional[dict]:
    tmdb_kind = signal["tmdb_kind"]
    tmdb_id = signal["tmdb_id"]
    external = await run_in_threadpool(
        _tmdb_request,
        f"/{tmdb_kind}/{tmdb_id}/external_ids",
        {},
    )
    imdb_id = external.get("imdb_id")
    if not imdb_id:
        return None

    details = await run_in_threadpool(_omdb_discovery_details, imdb_id)
    if not details:
        return None

    year_match = re.search(r"\d{4}", str(details.get("Year") or ""))
    year = int(year_match.group(0)) if year_match else None
    try:
        rating = float(details.get("imdbRating"))
    except (TypeError, ValueError):
        rating = None
    try:
        imdb_votes = int(re.sub(r"[^0-9]", "", str(details.get("imdbVotes") or "0")) or 0)
    except ValueError:
        imdb_votes = 0

    genres = [value.strip() for value in str(details.get("Genre") or "").split(",") if value.strip() and value != "N/A"]
    countries = [value.strip() for value in str(details.get("Country") or "").split(",") if value.strip() and value != "N/A"]
    raw_type = details.get("Type")
    if raw_type == "series":
        media_type = "anime" if "Animation" in genres and "Japan" in countries else "series"
    else:
        media_type = "movie"

    tags = set(signal.get("tags") or [])
    if "new" in tags and "trending" in tags:
        label = "Nouvelle sortie tendance"
        reason = "Une sortie récente très suivie, classée à partir de sa note et de sa popularité IMDb."
    elif "new" in tags:
        label = "Nouvelle sortie"
        reason = "Une sortie récente repérée puis vérifiée grâce à sa fiche IMDb."
    else:
        label = "Tendance du moment"
        reason = "Un titre populaire classé à partir de sa note et de son volume de votes IMDb."

    vote_score = min(45.0, (imdb_votes / 25000) * 10)
    imdb_score = (rating or 0) * 10 + vote_score
    poster = details.get("Poster")
    return {
        "id": imdb_id,
        "imdb_id": imdb_id,
        "tmdb_id": tmdb_id,
        "tmdb_kind": tmdb_kind,
        "imdb_url": f"https://www.imdb.com/title/{imdb_id}/",
        "title": details.get("Title") or signal.get("title") or "",
        "year": year,
        "type": media_type,
        "poster_url": poster if poster and poster != "N/A" else signal.get("poster_url"),
        "rating": rating,
        "imdb_votes": imdb_votes,
        "genres": genres,
        "release_date": details.get("Released") if details.get("Released") != "N/A" else signal.get("release_date"),
        "ai_label": label,
        "ai_reason": reason,
        "ai_score": round(float(signal.get("score") or 0) + imdb_score, 2),
    }


def _find_discovery_catalog_match(item: dict, records: List[dict]) -> Optional[dict]:
    tmdb_id = item.get("tmdb_id")
    if tmdb_id is not None:
        for record in records:
            if record.get("tmdb_id") == tmdb_id:
                return record
    title_key = _timeline_title_key(item.get("title"))
    item_year = item.get("year")
    for record in records:
        if _timeline_title_key(record.get("title")) != title_key:
            continue
        record_year = record.get("year")
        if item_year is None or record_year is None or int(record_year) == int(item_year):
            return record
    return None


async def _decorate_imdb_discovery(items: List[dict], limit: int) -> List[dict]:
    candidates = [dict(item) for item in items if isinstance(item, dict)]
    imdb_ids = [item.get("imdb_id") for item in candidates if item.get("imdb_id")]
    dismissed = set()
    if imdb_ids:
        dismissed = set(await db.admin_discovery_dismissals.distinct("imdb_id", {"imdb_id": {"$in": imdb_ids}}))
    visible = [item for item in candidates if item.get("imdb_id") not in dismissed]
    if not visible:
        return []

    tmdb_ids = [item.get("tmdb_id") for item in visible if item.get("tmdb_id") is not None]
    titles = [item.get("title") for item in visible if item.get("title")]
    clauses = []
    if tmdb_ids:
        clauses.append({"tmdb_id": {"$in": tmdb_ids}})
    if titles:
        clauses.append({"title": {"$in": titles}})
    active_records = []
    history_records = []
    if clauses:
        active_records = await db.media.find(
            {"$or": clauses},
            {"_id": 0, "id": 1, "title": 1, "type": 1, "year": 1, "tmdb_id": 1},
        ).to_list(200)
        history_records = await db.media_catalog_history.find(
            {"$or": clauses},
            {"_id": 0, "current_media_id": 1, "title": 1, "type": 1, "year": 1, "tmdb_id": 1, "active": 1},
        ).to_list(200)

    decorated = []
    for item in visible:
        active_match = _find_discovery_catalog_match(item, active_records)
        history_match = _find_discovery_catalog_match(item, history_records)
        item["already_added"] = bool(active_match)
        item["previously_added"] = bool(history_match)
        item["catalog_media_id"] = (active_match or {}).get("id")
        decorated.append(item)
    for position, item in enumerate(decorated[:limit], start=1):
        item["ai_rank"] = position
    return decorated[:limit]


@api_router.get("/discovery/imdb")
async def imdb_discovery(limit: int = 15, admin: dict = Depends(require_perm("content.add"))):
    """Veille externe basée sur les fiches, notes et volumes de votes IMDb."""
    if not OMDB_API_KEY:
        raise HTTPException(status_code=503, detail="Veille IMDb non configurée (clé OMDb manquante).")
    limit = max(1, min(limit, 30))
    now_tick = time.monotonic()
    if _imdb_discovery_cache["items_expires_at"] > now_tick and _imdb_discovery_cache["items"]:
        return await _decorate_imdb_discovery(_imdb_discovery_cache["items"], limit)

    signals = await _get_imdb_discovery_signals()
    candidate_limit = min(36, max(24, limit + 12))
    candidates = sorted(
        signals.values(),
        key=lambda item: item.get("score", 0),
        reverse=True,
    )[:candidate_limit]
    resolved = await asyncio.gather(*[
        _resolve_imdb_discovery_item(candidate)
        for candidate in candidates
    ], return_exceptions=True)
    ranked = [item for item in resolved if isinstance(item, dict)]
    ranked.sort(key=lambda item: (
        item.get("ai_score", 0),
        item.get("rating") or 0,
        item.get("imdb_votes") or 0,
    ), reverse=True)
    for position, item in enumerate(ranked, start=1):
        item["ai_rank"] = position
    _imdb_discovery_cache.update({
        "items_expires_at": now_tick + IMDB_DISCOVERY_CACHE_TTL_SECONDS,
        "items": ranked[:30],
    })
    return await _decorate_imdb_discovery(ranked, limit)


@api_router.delete("/admin/discovery/imdb/{imdb_id}")
async def dismiss_imdb_discovery(imdb_id: str, admin: dict = Depends(require_perm("content.add"))):
    if not re.fullmatch(r"tt\d{5,12}", imdb_id or ""):
        raise HTTPException(status_code=400, detail="Identifiant IMDb invalide")
    await db.admin_discovery_dismissals.update_one(
        {"imdb_id": imdb_id},
        {"$set": {
            "imdb_id": imdb_id,
            "dismissed_at": datetime.now(timezone.utc),
            "dismissed_by": admin.get("user_id"),
        }},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/discovery/ai", include_in_schema=False)
async def legacy_ai_discovery(limit: int = 15, admin: dict = Depends(require_perm("content.add"))):
    return await imdb_discovery(limit=limit, admin=admin)

@api_router.get("/genres")
async def list_genres(limit: int = 30):
    limit = max(1, min(limit, 100))
    agg = await db.media.aggregate([
        {"$unwind": "$genres"},
        {"$group": {"_id": "$genres", "count": {"$sum": 1}}},
        {"$sort": {"count": -1, "_id": 1}},
        {"$limit": limit},
    ]).to_list(limit)
    return [{"genre": a["_id"], "count": a["count"]} for a in agg if a.get("_id")]


@api_router.get("/public/stats")
async def public_stats():
    contents, users_count, comments = await asyncio.gather(
        db.media.count_documents({}),
        db.users.count_documents({}),
        db.reviews.count_documents({}),
    )
    users = await db.users.find(
        {},
        {
            "_id": 0,
            "premium_plan": 1,
            "premium_until": 1,
            "discord_premium_plan": 1,
            "discord_premium_until": 1,
            "license_entitlements": 1,
        },
    ).to_list(100000)
    subscribers = sum(1 for user in users if _is_premium(user))
    return {
        "contents": contents,
        "users": users_count,
        "comments": comments,
        "subscribers": subscribers,
    }

# ---------- Reviews ----------
@api_router.get("/media/{media_id}/reviews")
async def list_reviews(media_id: str):
    private_users = await db.users.find({"reviews_public": False}, {"_id": 0, "user_id": 1}).to_list(100000)
    private_ids = [item["user_id"] for item in private_users]
    query = {"media_id": media_id}
    if private_ids:
        query["user_id"] = {"$nin": private_ids}
    docs = await db.reviews.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
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
    if doc["user_id"] != user["user_id"] and _admin_level(user) < 2:
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.reviews.delete_one({"id": review_id})
    # remove any replies attached to a deleted top-level review
    if doc.get("parent_id") is None:
        await db.reviews.delete_many({"parent_id": review_id})
        await _recompute_rating(doc["media_id"])
    return {"ok": True}

# ---------- Notifications & Announcements ----------
@api_router.get("/referral/config")
async def referral_config():
    return await _effective_referral()


@api_router.get("/referral/me")
async def referral_me(user: dict = Depends(get_current_user)):
    config = await _effective_referral()
    filleuls = await db.referrals.find(
        {"parrain_id": user["user_id"]}, {"_id": 0, "filleul_name": 1, "coins_parrain": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(200)
    return {
        **config,
        "code": user.get("account_identifier") or "",
        "filleuls": filleuls,
        "total": len(filleuls),
        "coins_gagnes": round(sum(float(f.get("coins_parrain") or 0) for f in filleuls), 1),
    }


class ReferralConfigInput(BaseModel):
    enabled: Optional[bool] = None
    coins_parrain: Optional[float] = Field(default=None, ge=0, le=1000)
    coins_filleul: Optional[float] = Field(default=None, ge=0, le=1000)


@api_router.get("/admin/referral")
async def admin_get_referral(user: dict = Depends(require_perm("pricing.manage"))):
    return await _effective_referral()


@api_router.post("/admin/referral")
async def admin_set_referral(inp: ReferralConfigInput, user: dict = Depends(require_perm("pricing.manage"))):
    update = {k: v for k, v in inp.model_dump(exclude_unset=True).items() if v is not None}
    if update:
        await db.settings.update_one({"id": "referral"}, {"$set": update}, upsert=True)
    return await _effective_referral()


# ---------- Signalements ----------
MOTIFS_SIGNALEMENT = {
    "player": "Le lecteur ne démarre pas",
    "quality": "Mauvaise qualité d'image",
    "sound": "Problème de son",
    "subtitles": "Sous-titres absents ou décalés",
    "wrong": "Ce n'est pas le bon contenu",
    "other": "Autre",
}


class ReportCreate(BaseModel):
    media_id: str = Field(min_length=1, max_length=80)
    reason: str = Field(min_length=1, max_length=30)
    message: str = Field(default="", max_length=500)
    season_number: Optional[int] = Field(default=None, ge=0, le=99)
    episode_number: Optional[int] = Field(default=None, ge=0, le=999)


@api_router.post("/reports")
async def create_report(inp: ReportCreate, request: Request, user: Optional[dict] = Depends(get_optional_user)):
    await _enforce_rate_limit(request, "report", 10, 3600)
    if inp.reason not in MOTIFS_SIGNALEMENT:
        raise HTTPException(status_code=400, detail="Motif inconnu")
    media = await db.media.find_one({"id": inp.media_id}, {"_id": 0, "id": 1, "title": 1, "poster_url": 1, "type": 1})
    if not media:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    await db.reports.insert_one({
        "id": f"rep_{uuid.uuid4().hex[:12]}",
        "media_id": media["id"],
        "media_title": media.get("title", ""),
        "media_poster": media.get("poster_url"),
        "reason": inp.reason,
        "message": inp.message.strip(),
        "season_number": inp.season_number,
        "episode_number": inp.episode_number,
        "user_id": user.get("user_id") if user else None,
        "user_name": (user or {}).get("name") or "Visiteur",
        "handled": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


@api_router.get("/admin/reports")
async def admin_list_reports(user: dict = Depends(require_perm("content.edit"))):
    docs = await db.reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for doc in docs:
        doc["reason_label"] = MOTIFS_SIGNALEMENT.get(doc.get("reason"), "Autre")
    return {"items": docs, "open": sum(1 for d in docs if not d.get("handled"))}


@api_router.patch("/admin/reports/{report_id}")
async def admin_handle_report(report_id: str, user: dict = Depends(require_perm("content.edit"))):
    doc = await db.reports.find_one({"id": report_id}, {"_id": 0, "handled": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Signalement introuvable")
    nouveau = not bool(doc.get("handled"))
    await db.reports.update_one({"id": report_id}, {"$set": {"handled": nouveau}})
    return {"ok": True, "handled": nouveau}


@api_router.delete("/admin/reports/{report_id}")
async def admin_delete_report(report_id: str, user: dict = Depends(require_perm("content.edit"))):
    result = await db.reports.delete_one({"id": report_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Signalement introuvable")
    return {"ok": True}


# ---------- Bandeau de soutien ----------
BANNER_DEFAULTS = {
    "enabled": False,
    "always_show": False,
    "message": "Chaque visionnage a un coût, et YourMovie's ne rapporte rien pour l'instant. Un coup de main aide à garder les lecteurs allumés.",
    "cta_label": "Soutenir le site",
}


async def _effective_banner() -> dict:
    doc = await db.settings.find_one({"id": "support_banner"}, {"_id": 0}) or {}
    config = dict(BANNER_DEFAULTS)
    config["enabled"] = bool(doc.get("enabled", config["enabled"]))
    config["always_show"] = bool(doc.get("always_show", config["always_show"]))
    for cle in ("message", "cta_label"):
        valeur = doc.get(cle)
        if isinstance(valeur, str) and valeur.strip():
            config[cle] = valeur.strip()[:300]
    return config


class BannerInput(BaseModel):
    enabled: Optional[bool] = None
    always_show: Optional[bool] = None
    message: Optional[str] = Field(default=None, max_length=300)
    cta_label: Optional[str] = Field(default=None, max_length=40)


@api_router.get("/support-banner")
async def support_banner():
    return await _effective_banner()


@api_router.get("/admin/support-banner")
async def admin_get_banner(user: dict = Depends(require_perm("cagnotte.manage"))):
    return await _effective_banner()


@api_router.post("/admin/support-banner")
async def admin_set_banner(inp: BannerInput, user: dict = Depends(require_perm("cagnotte.manage"))):
    update = {k: v for k, v in inp.model_dump(exclude_unset=True).items() if v is not None}
    if update:
        await db.settings.update_one({"id": "support_banner"}, {"$set": update}, upsert=True)
    return await _effective_banner()


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
    polls = await db.polls.find({"closed": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(10)
    poll_items = [{
        "id": p["id"],
        "type": "poll",
        "title": "Nouveau sondage",
        "body": p.get("question", ""),
        "media_title": None,
        "link": "/sondages",
        "created_at": p.get("created_at", ""),
        "read": bool(seen_at and p.get("created_at", "") <= seen_at),
    } for p in polls]
    items = personal + ann_items + poll_items
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    unread = sum(1 for it in items if not it.get("read"))
    return {"items": items[:50], "unread": unread}

@api_router.post("/notifications/read")
async def mark_notifications_read(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    await db.notifications.update_many({"user_id": user["user_id"], "read": False}, {"$set": {"read": True}})
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"notif_seen_at": now}})
    return {"ok": True}

# ---------- Sondages ----------
class PollCreate(BaseModel):
    question: str = Field(min_length=3, max_length=200)
    options: List[str] = Field(min_length=2, max_length=10)


class PollVote(BaseModel):
    option_index: int = Field(ge=0, le=9)
    voter_key: Optional[str] = Field(default=None, max_length=80)


def _voter_key(user: Optional[dict], fourni: Optional[str]) -> Optional[str]:
    """Un compte est identifie par son user_id ; un visiteur par la cle tiree au
    sort dans son navigateur. Sans cle, on ne peut pas empecher le double vote."""
    if user:
        return "u:" + str(user["user_id"])
    propre = re.sub(r"[^A-Za-z0-9_-]", "", str(fourni or ""))[:64]
    return ("a:" + propre) if len(propre) >= 8 else None


async def _poll_public(poll: dict, cle: Optional[str]) -> dict:
    votes = await db.poll_votes.find({"poll_id": poll["id"]}, {"_id": 0, "option_index": 1, "voter_key": 1}).to_list(100000)
    options = poll.get("options") or []
    comptes = [0] * len(options)
    mon_vote = None
    for vote in votes:
        index = int(vote.get("option_index", -1))
        if 0 <= index < len(comptes):
            comptes[index] += 1
        if cle and vote.get("voter_key") == cle:
            mon_vote = index
    total = sum(comptes)
    # Les resultats ne sont reveles qu'apres avoir vote : sinon le premier
    # pourcentage affiche oriente tous les votes suivants.
    devoile = mon_vote is not None or bool(poll.get("closed"))
    return {
        "id": poll["id"],
        "question": poll.get("question", ""),
        "options": [{
            "label": label,
            "votes": comptes[i] if devoile else None,
            "percent": (round(comptes[i] * 100 / total) if total else 0) if devoile else None,
        } for i, label in enumerate(options)],
        "total_votes": total if devoile else None,
        "my_vote": mon_vote,
        "closed": bool(poll.get("closed")),
        "created_at": poll.get("created_at", ""),
    }


@api_router.get("/polls")
async def list_polls(voter: Optional[str] = Query(None), user: Optional[dict] = Depends(get_optional_user)):
    docs = await db.polls.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    cle = _voter_key(user, voter)
    return [await _poll_public(doc, cle) for doc in docs]


@api_router.post("/polls/{poll_id}/vote")
async def vote_poll(poll_id: str, inp: PollVote, request: Request, user: Optional[dict] = Depends(get_optional_user)):
    await _enforce_rate_limit(request, "poll-vote", 30, 300)
    poll = await db.polls.find_one({"id": poll_id}, {"_id": 0})
    if not poll:
        raise HTTPException(status_code=404, detail="Sondage introuvable")
    if poll.get("closed"):
        raise HTTPException(status_code=403, detail="Ce sondage est clos")
    if inp.option_index >= len(poll.get("options") or []):
        raise HTTPException(status_code=400, detail="Choix invalide")
    cle = _voter_key(user, inp.voter_key)
    if not cle:
        raise HTTPException(status_code=400, detail="Impossible d'identifier le votant")
    deja = await db.poll_votes.find_one({"poll_id": poll_id, "voter_key": cle}, {"_id": 1})
    if deja:
        raise HTTPException(status_code=409, detail="Tu as déjà voté pour ce sondage")
    await db.poll_votes.insert_one({
        "poll_id": poll_id,
        "voter_key": cle,
        "option_index": inp.option_index,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    fresh = await db.polls.find_one({"id": poll_id}, {"_id": 0})
    return await _poll_public(fresh, cle)


@api_router.get("/admin/polls")
async def admin_list_polls(admin: dict = Depends(require_perm("polls.manage"))):
    docs = await db.polls.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    sortie = []
    for doc in docs:
        votes = await db.poll_votes.find({"poll_id": doc["id"]}, {"_id": 0, "option_index": 1}).to_list(100000)
        options = doc.get("options") or []
        comptes = [0] * len(options)
        for vote in votes:
            index = int(vote.get("option_index", -1))
            if 0 <= index < len(comptes):
                comptes[index] += 1
        total = sum(comptes)
        sortie.append({
            "id": doc["id"],
            "question": doc.get("question", ""),
            "closed": bool(doc.get("closed")),
            "created_at": doc.get("created_at", ""),
            "total_votes": total,
            "options": [{
                "label": label,
                "votes": comptes[i],
                "percent": round(comptes[i] * 100 / total) if total else 0,
            } for i, label in enumerate(options)],
        })
    return sortie


@api_router.post("/admin/polls")
async def admin_create_poll(inp: PollCreate, admin: dict = Depends(require_perm("polls.manage"))):
    options = [o.strip()[:120] for o in inp.options if o and o.strip()]
    if len(options) < 2:
        raise HTTPException(status_code=400, detail="Il faut au moins deux choix")
    doc = {
        "id": f"poll_{uuid.uuid4().hex[:12]}",
        "question": inp.question.strip(),
        "options": options,
        "closed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": admin.get("user_id"),
    }
    await db.polls.insert_one(doc)
    return {"ok": True, "id": doc["id"]}


@api_router.patch("/admin/polls/{poll_id}")
async def admin_close_poll(poll_id: str, admin: dict = Depends(require_perm("polls.manage"))):
    result = await db.polls.update_one({"id": poll_id}, [{"$set": {"closed": {"$not": ["$closed"]}}}])
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sondage introuvable")
    fresh = await db.polls.find_one({"id": poll_id}, {"_id": 0, "closed": 1})
    return {"ok": True, "closed": bool(fresh.get("closed"))}


@api_router.delete("/admin/polls/{poll_id}")
async def admin_delete_poll(poll_id: str, admin: dict = Depends(require_perm("polls.manage"))):
    result = await db.polls.delete_one({"id": poll_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sondage introuvable")
    await db.poll_votes.delete_many({"poll_id": poll_id})
    return {"ok": True}


@api_router.get("/admin/reviews")
async def admin_list_reviews(admin: dict = Depends(require_perm("reviews.moderate"))):
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
async def create_announcement(a: AnnouncementCreate, admin: dict = Depends(require_perm("announcements.manage"))):
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
async def delete_announcement(announcement_id: str, admin: dict = Depends(require_perm("announcements.manage"))):
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

def _tmdb_headers() -> dict:
    return {"Authorization": f"Bearer {TMDB_API_TOKEN}"} if TMDB_API_TOKEN else {}


def _tmdb_params(extra: Optional[dict] = None) -> dict:
    params = dict(extra or {})
    if not TMDB_API_TOKEN and TMDB_API_KEY:
        params["api_key"] = TMDB_API_KEY
    return params


def _tmdb_request(path: str, params: Optional[dict] = None) -> dict:
    if not (TMDB_API_TOKEN or TMDB_API_KEY):
        raise HTTPException(status_code=503, detail="Import TMDB non configuré.")
    try:
        response = requests.get(
            f"{TMDB_BASE_URL}{path}",
            headers=_tmdb_headers(),
            params=_tmdb_params(params),
            timeout=15,
        )
        response.raise_for_status()
        return response.json()
    except requests.HTTPError as exc:
        logger.warning("TMDB HTTP error: %s", exc)
        raise HTTPException(status_code=502, detail="TMDB a refusé la requête.")
    except requests.RequestException as exc:
        logger.warning("TMDB unavailable: %s", exc)
        raise HTTPException(status_code=502, detail="TMDB est momentanément indisponible.")


def _tmdb_image(path: Optional[str]) -> Optional[str]:
    return f"{TMDB_IMAGE_URL}{path}" if path else None


def _tmdb_year(value: Optional[str]) -> Optional[int]:
    try:
        return int((value or "")[:4]) or None
    except (TypeError, ValueError):
        return None


def _timeline_family_variants(value: Optional[str]) -> set:
    key = _timeline_title_key(value)
    if not key:
        return set()
    variants = {key}
    variants.add(re.split(r"\b(?:saison|season|partie|part|chapitre|chapter|arc)\b", key, maxsplit=1)[0].strip())
    variants.add(re.sub(r"\b(?:saison|season|partie|part|chapitre|chapter|arc)?\s*(?:[0-9]+|i{1,4}|v|vi{0,3}|ix|x)\s*$", "", key).strip())
    return {variant for variant in variants if len(variant) >= 4}


def _same_timeline_family(reference_titles: List[str], candidate_title: Optional[str]) -> bool:
    reference_variants = set()
    for title in reference_titles:
        reference_variants.update(_timeline_family_variants(title))
    candidate_variants = _timeline_family_variants(candidate_title)
    if not reference_variants or not candidate_variants:
        return False
    if reference_variants & candidate_variants:
        return True
    for reference in reference_variants:
        for candidate in candidate_variants:
            shorter, longer = sorted((reference, candidate), key=len)
            if len(shorter) >= 5 and (longer.startswith(f"{shorter} ") or longer.endswith(f" {shorter}")):
                return True
            reference_tokens = set(reference.split())
            candidate_tokens = set(candidate.split())
            shared = reference_tokens & candidate_tokens
            if len(shared) >= 2 and len(shared) / max(1, min(len(reference_tokens), len(candidate_tokens))) >= 0.66:
                return True
    return False


def _tmdb_timeline_item(item: dict, kind: Literal["movie", "series", "anime"]) -> dict:
    release_date = item.get("release_date") or item.get("first_air_date")
    return {
        "tmdb_id": item.get("id"),
        "title": item.get("title") or item.get("name") or item.get("original_title") or item.get("original_name") or "Titre inconnu",
        "type": kind,
        "year": _tmdb_year(release_date),
        "release_date": release_date or None,
        "poster_url": _tmdb_image(item.get("poster_path")),
    }


async def _tmdb_timeline_proposal(
    tmdb_kind: Literal["movie", "tv"],
    tmdb_id: int,
    kind: Literal["movie", "series", "anime"],
    details: Optional[dict] = None,
) -> dict:
    data = details or await run_in_threadpool(
        _tmdb_request,
        f"/{tmdb_kind}/{tmdb_id}",
        {"language": "fr-FR"},
    )

    if tmdb_kind == "movie":
        collection = data.get("belongs_to_collection") or {}
        collection_id = collection.get("id")
        if not collection_id:
            return {"saga_title": None, "timeline": []}
        collection_data = await run_in_threadpool(
            _tmdb_request,
            f"/collection/{collection_id}",
            {"language": "fr-FR"},
        )
        candidates = collection_data.get("parts") or []
        saga_title = collection_data.get("name") or collection.get("name")
    else:
        reference_titles = [
            data.get("name"),
            data.get("original_name"),
        ]
        requests_to_run = [
            run_in_threadpool(
                _tmdb_request,
                f"/tv/{tmdb_id}/recommendations",
                {"language": "fr-FR", "page": 1},
            )
        ]
        for query in dict.fromkeys(title for title in reference_titles if title):
            requests_to_run.append(run_in_threadpool(
                _tmdb_request,
                "/search/tv",
                {"query": query, "language": "fr-FR", "include_adult": "false", "page": 1},
            ))
        responses = await asyncio.gather(*requests_to_run, return_exceptions=True)
        pool = [data]
        for response in responses:
            if not isinstance(response, dict):
                logger.warning("Une source TMDB de chronologie est indisponible : %s", response)
                continue
            pool.extend(response.get("results") or [])
        candidates = []
        seen_ids = set()
        for candidate in pool:
            candidate_id = candidate.get("id")
            candidate_title = candidate.get("name") or candidate.get("original_name")
            if candidate_id in seen_ids:
                continue
            if candidate_id == tmdb_id or _same_timeline_family(reference_titles, candidate_title):
                seen_ids.add(candidate_id)
                candidates.append(candidate)
        shortest_title = min((title for title in reference_titles if title), key=len, default="")
        saga_title = f"Univers {shortest_title}".strip()

    timeline = [_tmdb_timeline_item(item, kind) for item in candidates if item.get("id")]
    timeline.sort(key=lambda item: (
        item.get("release_date") is None,
        item.get("release_date") or "9999-12-31",
        item.get("year") or 9999,
        item.get("tmdb_id") or 0,
    ))
    if len(timeline) < 2:
        return {"saga_title": None, "timeline": []}
    return {"saga_title": saga_title, "timeline": timeline[:30]}


@api_router.get("/admin/tmdb/search")
async def admin_tmdb_search(
    q: str = Query(min_length=2, max_length=120),
    kind: Literal["movie", "series", "anime"] = "movie",
    admin: dict = Depends(require_admin),
):
    tmdb_kind = "movie" if kind == "movie" else "tv"
    data = await run_in_threadpool(
        _tmdb_request,
        f"/search/{tmdb_kind}",
        {"query": q.strip(), "language": "fr-FR", "include_adult": "false", "page": 1},
    )
    results = []
    for item in data.get("results", [])[:10]:
        title = item.get("title") or item.get("name")
        date = item.get("release_date") or item.get("first_air_date")
        if not title:
            continue
        results.append({
            "tmdb_id": item.get("id"),
            "media_type": tmdb_kind,
            "title": title,
            "original_title": item.get("original_title") or item.get("original_name"),
            "year": _tmdb_year(date),
            "description": item.get("overview") or "",
            "poster_url": _tmdb_image(item.get("poster_path")),
            "banner_url": _tmdb_image(item.get("backdrop_path")),
            "rating": item.get("vote_average"),
        })
    return results


@api_router.get("/admin/tmdb/timeline/{tmdb_kind}/{tmdb_id}")
async def admin_tmdb_timeline(
    tmdb_kind: Literal["movie", "tv"],
    tmdb_id: int,
    kind: Literal["movie", "series", "anime"] = "movie",
    admin: dict = Depends(require_admin),
):
    expected_kind = "movie" if kind == "movie" else "tv"
    if tmdb_kind != expected_kind:
        raise HTTPException(status_code=400, detail="Le type TMDB ne correspond pas au contenu.")
    return await _tmdb_timeline_proposal(tmdb_kind, tmdb_id, kind)


@api_router.get("/admin/tmdb/import/{tmdb_kind}/{tmdb_id}")
async def admin_tmdb_import(
    tmdb_kind: Literal["movie", "tv"],
    tmdb_id: int,
    kind: Literal["movie", "series", "anime"] = "movie",
    admin: dict = Depends(require_admin),
):
    append = "credits,videos,images,release_dates" if tmdb_kind == "movie" else "credits,videos,images,content_ratings"
    data = await run_in_threadpool(
        _tmdb_request,
        f"/{tmdb_kind}/{tmdb_id}",
        {
            "language": "fr-FR",
            "append_to_response": append,
            "include_image_language": "fr,en,null",
        },
    )
    videos = (data.get("videos") or {}).get("results", [])
    trailer = next(
        (v for v in videos if v.get("site") == "YouTube" and v.get("type") == "Trailer" and v.get("official")),
        None,
    ) or next((v for v in videos if v.get("site") == "YouTube" and v.get("type") == "Trailer"), None)
    credits = data.get("credits") or {}
    crew = credits.get("crew") or []
    if tmdb_kind == "movie":
        director = next((p.get("name") for p in crew if p.get("job") == "Director"), None)
    else:
        creators = data.get("created_by") or []
        director = ", ".join(p.get("name") for p in creators if p.get("name")) or None
    countries = data.get("production_countries") or data.get("origin_country") or []
    country = ", ".join(
        (item.get("name") if isinstance(item, dict) else str(item)) for item in countries
    )
    certifications = []
    if tmdb_kind == "movie":
        release_groups = (data.get("release_dates") or {}).get("results", [])
        for country_code in ("FR", "US"):
            release = next((item for item in release_groups if item.get("iso_3166_1") == country_code), None)
            if release:
                certifications = [
                    item.get("certification")
                    for item in release.get("release_dates", [])
                    if item.get("certification")
                ]
                if certifications:
                    break
    else:
        rating_groups = (data.get("content_ratings") or {}).get("results", [])
        for country_code in ("FR", "US"):
            rating = next(
                (item for item in rating_groups if item.get("iso_3166_1") == country_code and item.get("rating")),
                None,
            )
            if rating:
                certifications = [rating["rating"]]
                break

    def normalize_age_rating(value: Optional[str]) -> Optional[str]:
        raw = (value or "").strip().upper()
        if not raw:
            return None
        if raw in {"TP", "U", "G", "TV-G", "TOUS PUBLICS"}:
            return "Tous publics"
        french_match = re.search(r"(10|12|16|18)", raw)
        if french_match:
            return f"-{french_match.group(1)}"
        us_map = {
            "PG": "-10",
            "TV-PG": "-10",
            "PG-13": "-12",
            "TV-14": "-12",
            "R": "-16",
            "NC-17": "-18",
            "TV-MA": "-18",
        }
        return us_map.get(raw, raw)
    logos = (data.get("images") or {}).get("logos", [])
    logo = next((image for image in logos if image.get("iso_639_1") == "fr"), None) or (logos[0] if logos else None)
    release_date = data.get("release_date") or data.get("first_air_date")
    runtime = data.get("runtime")
    if not runtime:
        runtimes = data.get("episode_run_time") or []
        runtime = runtimes[0] if runtimes else None
    seasons = []
    if tmdb_kind == "tv":
        for season_summary in data.get("seasons", []):
            season_number = season_summary.get("season_number", 0)
            if season_number <= 0:
                continue
            season_data = await run_in_threadpool(
                _tmdb_request,
                f"/tv/{tmdb_id}/season/{season_number}",
                {"language": "fr-FR"},
            )
            episodes = []
            for episode in season_data.get("episodes", []):
                episodes.append({
                    "tmdb_id": episode.get("id"),
                    "ep_number": episode.get("episode_number"),
                    "title": episode.get("name") or f"Épisode {episode.get('episode_number', '')}".strip(),
                    "duration": episode.get("runtime") or runtime,
                    "description": episode.get("overview") or "",
                    "air_date": episode.get("air_date"),
                    "still_url": _tmdb_image(episode.get("still_path")),
                    # Ces champs sont volontairement vides : l'admin ajoute le MP4
                    # correspondant sans que les imports suivants ne l'écrasent.
                    "video_url": "",
                    "video_file_path": "",
                    "bunny_video_id": "",
                    "bunny_library_id": "",
                })
            seasons.append({
                "tmdb_id": season_summary.get("id"),
                "season_number": season_number,
                "title": season_data.get("name") or season_summary.get("name") or "",
                "description": season_data.get("overview") or "",
                "poster_url": _tmdb_image(season_data.get("poster_path") or season_summary.get("poster_path")),
                "episodes": episodes,
            })
    timeline_proposal = await _tmdb_timeline_proposal(tmdb_kind, tmdb_id, kind, details=data)
    return {
        "tmdb_id": tmdb_id,
        "tmdb_kind": tmdb_kind,
        "title": data.get("title") or data.get("name") or "",
        "description": data.get("overview") or "",
        "type": kind,
        "year": _tmdb_year(release_date),
        "duration_minutes": runtime,
        "genres": [genre.get("name") for genre in data.get("genres", []) if genre.get("name")],
        "poster_url": _tmdb_image(data.get("poster_path")),
        "banner_url": _tmdb_image(data.get("backdrop_path")),
        "title_logo_url": _tmdb_image(logo.get("file_path")) if logo else None,
        "age_rating": normalize_age_rating(certifications[0]) if certifications else None,
        "trailer_youtube_id": trailer.get("key") if trailer else None,
        "cast": [person.get("name") for person in (credits.get("cast") or [])[:15] if person.get("name")],
        "director": director,
        "country": country or None,
        "rating": round(float(data.get("vote_average") or 0), 1) or None,
        "seasons": seasons,
        "saga_title": timeline_proposal.get("saga_title"),
        "timeline": timeline_proposal.get("timeline", []),
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
async def admin_list_wishboard(admin: dict = Depends(require_perm("wishboard.view"))):
    docs = await db.wishboard.find({}, {"_id": 0}).to_list(1000)
    out = [_wish_out(d, None) for d in docs]
    out.sort(key=lambda x: x["vote_count"], reverse=True)
    return out

@api_router.patch("/wishboard/{wish_id}/status")
async def set_wish_status(wish_id: str, s: WishStatus, admin: dict = Depends(require_admin)):
    needed = "wishboard.approve" if s.status == "approved" else "wishboard.moderate"
    if not has_perm(admin, needed):
        raise HTTPException(status_code=403, detail="Tu n'as pas la permission pour cette action.")
    update: dict = {"$set": {"status": s.status}}
    if s.status == "approved":
        approved_at = datetime.now(timezone.utc)
        update["$set"].update({
            "approved_at": approved_at,
            "approved_expires_at": approved_at + timedelta(hours=24),
        })
    else:
        # Une demande remise en attente ou refusée ne doit pas être supprimée
        # par l'ancienne échéance d'une approbation.
        update["$unset"] = {"approved_at": "", "approved_expires_at": ""}
    res = await db.wishboard.update_one({"id": wish_id}, update)
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True, "status": s.status}

@api_router.delete("/wishboard/{wish_id}")
async def delete_wish(wish_id: str, admin: dict = Depends(require_perm("wishboard.moderate"))):
    res = await db.wishboard.delete_one({"id": wish_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

# ---------- Soutien gratuit : regarder une pub contre des Freemium ----------
def _reward_state(user: dict, cfg: dict) -> dict:
    """Cooldown restant et quota du jour pour la récompense « regarder une pub »."""
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    used = int(user.get("ad_reward_count", 0) or 0) if user.get("ad_reward_day") == today else 0
    remaining = max(0, int(cfg["daily_max"]) - used)
    wait = 0
    last = user.get("ad_reward_last")
    if last and cfg["cooldown_minutes"] > 0:
        try:
            dt = datetime.fromisoformat(last) if isinstance(last, str) else last
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            elapsed = (now - dt).total_seconds()
            wait = max(0, int(cfg["cooldown_minutes"] * 60 - elapsed))
        except Exception:
            wait = 0
    return {"used_today": used, "remaining_today": remaining, "cooldown_seconds": wait}

@api_router.get("/rewards/support/status")
async def support_reward_status(user: dict = Depends(get_current_user)):
    ads = await _effective_ads()
    cfg = ads["reward"]
    active = bool(ads["enabled"] and cfg["enabled"] and (ads["gate"]["direct_link"] or ads["popunder"]["script_url"]))
    return {"available": active, **cfg, **_reward_state(user, cfg)}

@api_router.post("/rewards/support")
async def support_reward_claim(user: dict = Depends(get_current_user)):
    ads = await _effective_ads()
    cfg = ads["reward"]
    if not (ads["enabled"] and cfg["enabled"]):
        raise HTTPException(status_code=403, detail="Le soutien gratuit est désactivé.")
    state = _reward_state(user, cfg)
    if state["remaining_today"] <= 0:
        raise HTTPException(status_code=429, detail="Quota du jour atteint. Reviens demain !")
    if state["cooldown_seconds"] > 0:
        raise HTTPException(status_code=429, detail=f"Patiente encore {state['cooldown_seconds'] // 60 + 1} min avant la prochaine pub.")

    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    same_day = user.get("ad_reward_day") == today
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {
        "ad_reward_day": today,
        "ad_reward_count": (int(user.get("ad_reward_count", 0) or 0) + 1) if same_day else 1,
        "ad_reward_last": now.isoformat(),
    }})
    balance = await award_coins(
        user["user_id"], cfg["coins"],
        f"+{cfg['coins']} Freemium · merci pour ton soutien 💛",
        "Tu as soutenu YourMovie's en regardant une publicité.",
    )
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    # « balance » et non « coins » : côté client, « coins » désigne le gain par
    # publicité (config) — les confondre affichait le solde comme un gain.
    return {"awarded": cfg["coins"], "balance": balance, **_reward_state(fresh or user, cfg)}

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
    offer = await _welcome_offer(user)
    coin_plans = await _effective_coin_plans()
    plans = []
    for k, v in coin_plans.items():
        opts = [{"days": o["days"], "coins": _offer_price(o["coins"], offer), "coins_original": o["coins"]} for o in v["options"]]
        plans.append({"id": k, "name": v["name"], "options": opts})
    return {
        "balance": round(float(user.get("coins", 0) or 0), 1),
        "plans": plans,
        "offer": offer,
    }

@api_router.post("/coins/redeem")
async def coins_redeem(inp: RedeemInput, user: dict = Depends(get_current_user)):
    coin_plans = await _effective_coin_plans()
    plan = coin_plans.get(inp.plan)
    if not plan:
        raise HTTPException(status_code=400, detail="Plan inconnu")
    option = next((o for o in plan["options"] if o["days"] == inp.days), None)
    if not option:
        raise HTTPException(status_code=400, detail="Durée invalide")
    offer = await _welcome_offer(user)
    cost = _offer_price(option["coins"], offer)
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
        {"name": {"$regex": re.escape(q), "$options": "i"}, "profile_public": {"$ne": False}},
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
        "banner": u.get("banner"),
        "premium": _is_premium(u),
        "profile_background_color": u.get("profile_background_color") if _effective_premium_entitlement(u) else None,
        "online": _is_online(u),
        "created_at": u.get("created_at"),
        "followers": followers,
        "following": following,
        "is_following": is_following,
        "is_self": is_self,
    }
    # profil privé : on masque le contenu aux visiteurs (le propriétaire voit tout)
    if not u.get("profile_public", True) and not is_self:
        return {"user_id": uid, "name": u.get("name"), "private": True, "is_self": False}

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
async def admin_set_coins(user_id: str, inp: AdminCoinsInput, admin: dict = Depends(require_perm("users.coins"))):
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
UPLOAD_LIMITS = {
    "free": {"monthly": 10 * 1024 * 1024, "per_file": 3 * 1024 * 1024},
    "basic": {"monthly": 50 * 1024 * 1024, "per_file": 5 * 1024 * 1024},
    "standard": {"monthly": 150 * 1024 * 1024, "per_file": 10 * 1024 * 1024},
    "premium": {"monthly": 500 * 1024 * 1024, "per_file": 20 * 1024 * 1024},
    "admin": {"monthly": 10 * 1024 * 1024 * 1024, "per_file": 2 * 1024 * 1024 * 1024},
}
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
IMAGE_SIGNATURES = (b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"GIF87a", b"GIF89a")

def _upload_tier(user: dict) -> str:
    if _admin_level(user) >= 1:
        return "admin"
    entitlement = _effective_premium_entitlement(user)
    return entitlement["plan"] if entitlement and entitlement["plan"] in UPLOAD_LIMITS else "free"

async def _monthly_upload_usage(user_id: str) -> int:
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    pipeline = [
        {"$match": {"uploaded_by": user_id, "created_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "bytes": {"$sum": "$size"}}},
    ]
    rows = await db.files.aggregate(pipeline).to_list(1)
    return int(rows[0].get("bytes", 0) or 0) if rows else 0

async def _reserve_upload_quota(user_id: str, size: int, monthly_limit: int) -> str:
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    quota_id = f"{user_id}:{month}"
    await db.upload_quotas.update_one(
        {"id": quota_id},
        {"$setOnInsert": {"id": quota_id, "user_id": user_id, "month": month, "bytes": 0}},
        upsert=True,
    )
    reserved = await db.upload_quotas.find_one_and_update(
        {"id": quota_id, "bytes": {"$lte": monthly_limit - size}},
        {"$inc": {"bytes": size}},
        return_document=ReturnDocument.AFTER,
    )
    if not reserved:
        raise HTTPException(status_code=429, detail="Quota mensuel de téléversement atteint")
    return quota_id

@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), kind: str = Form("image"), user: dict = Depends(get_current_user)):
    if kind not in {"image", "video"}:
        raise HTTPException(status_code=400, detail="Type de fichier non autorisé")
    if kind == "video" and _admin_level(user) < 1:
        raise HTTPException(status_code=403, detail="Admin only")
    if not CLOUDINARY_CONFIGURED:
        raise HTTPException(status_code=500, detail="Stockage non configuré (CLOUDINARY_URL manquant)")
    tier = _upload_tier(user)
    limits = UPLOAD_LIMITS[tier]
    file.file.seek(0, os.SEEK_END)
    size = file.file.tell()
    file.file.seek(0)
    if size <= 0 or size > limits["per_file"]:
        raise HTTPException(status_code=413, detail=f"Fichier trop volumineux pour le plan {tier}")
    if kind == "image":
        header = await file.read(16)
        await file.seek(0)
        is_webp = len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP"
        if file.content_type not in ALLOWED_IMAGE_TYPES or (not header.startswith(IMAGE_SIGNATURES) and not is_webp):
            raise HTTPException(status_code=415, detail="Image invalide. Formats autorisés : JPEG, PNG, WebP et GIF")
    quota_id = await _reserve_upload_quota(user["user_id"], size, limits["monthly"])
    resource_type = "video" if kind == "video" else "image"
    try:
        result = cloudinary.uploader.upload(
            file.file,
            folder=f"{APP_NAME}/{kind}",
            resource_type=resource_type,
        )
    except Exception as e:
        await db.upload_quotas.update_one({"id": quota_id}, {"$inc": {"bytes": -size}})
        logger.error(f"Cloudinary upload failed: {e}")
        raise HTTPException(status_code=500, detail="Téléversement impossible")
    url = result.get("secure_url")
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": result.get("public_id"),
        "url": url,
        "original_filename": file.filename,
        "kind": kind,
        "size": int(result.get("bytes", size) or size),
        "plan_at_upload": tier,
        "uploaded_by": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"path": result.get("public_id"), "url": url, "size": result.get("bytes", size), "content_type": file.content_type}

@api_router.post("/upload/sign")
async def upload_sign(kind: str = Form("image"), user: dict = Depends(get_current_user)):
    if _admin_level(user) < 1:
        raise HTTPException(status_code=403, detail="La signature directe est réservée aux administrateurs")
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
async def bunny_create_video(title: str = Form("video"), user: dict = Depends(require_perm("content.add"))):
    if not BUNNY_CONFIGURED:
        raise HTTPException(status_code=500, detail="Hébergeur vidéo non configuré")
    import hashlib, time
    r = await run_in_threadpool(lambda: requests.post(
        f"https://video.bunnycdn.com/library/{BUNNY_LIBRARY_ID}/videos",
        headers={"AccessKey": BUNNY_API_KEY, "Content-Type": "application/json"},
        json={"title": title}, timeout=30,
    ))
    if not r.ok:
        logger.error(f"Video creation failed: {r.status_code} {r.text[:200]}")
        raise HTTPException(status_code=500, detail="Création de la vidéo impossible")
    video_id = r.json().get("guid")
    expire = int(time.time()) + 3600
    signature = hashlib.sha256(f"{BUNNY_LIBRARY_ID}{BUNNY_API_KEY}{expire}{video_id}".encode()).hexdigest()
    return {"videoId": video_id, "libraryId": str(BUNNY_LIBRARY_ID), "signature": signature, "expire": expire}

async def _remove_bunny_reference(video_id: str, library_id: str) -> None:
    """Retire une vidéo supprimée de tous les médias et épisodes qui la référencent."""
    docs = await db.media.find(
        {"$or": [
            {"bunny_video_id": video_id},
            {"seasons.episodes.bunny_video_id": video_id},
        ]},
        {"_id": 0},
    ).to_list(10000)
    for doc in docs:
        updates = {}
        if str(doc.get("bunny_video_id") or "") == video_id:
            updates.update({
                "bunny_video_id": "",
                "bunny_library_id": "",
                "video_url": "",
                "video_file_path": "",
            })
        seasons = doc.get("seasons") or []
        seasons_changed = False
        for season in seasons:
            for episode in season.get("episodes") or []:
                if str(episode.get("bunny_video_id") or "") != video_id:
                    continue
                episode.update({
                    "bunny_video_id": "",
                    "bunny_library_id": "",
                    "video_url": "",
                    "video_file_path": "",
                })
                seasons_changed = True
        if seasons_changed:
            updates["seasons"] = seasons
        if updates:
            await db.media.update_one({"id": doc["id"]}, {"$set": updates})


def _validated_bunny_library_id(library_id: Optional[str]) -> str:
    resolved = str(library_id or BUNNY_LIBRARY_ID or "").strip()
    if not resolved or not re.fullmatch(r"\d+", resolved):
        raise HTTPException(status_code=400, detail="Bibliothèque vidéo invalide")
    return resolved


@api_router.get("/bunny/video-status/{video_id}")
async def bunny_video_status(
    video_id: str,
    library_id: Optional[str] = Query(None),
    user: dict = Depends(require_admin),
):
    if not BUNNY_CONFIGURED:
        raise HTTPException(status_code=500, detail="Hébergeur vidéo non configuré")
    resolved_library_id = _validated_bunny_library_id(library_id)
    r = await run_in_threadpool(lambda: requests.get(
        f"https://video.bunnycdn.com/library/{resolved_library_id}/videos/{video_id}",
        headers={"AccessKey": BUNNY_API_KEY}, timeout=15,
    ))
    if r.status_code == 404:
        await _remove_bunny_reference(video_id, resolved_library_id)
        raise HTTPException(status_code=404, detail="Vidéo supprimée de l'hébergeur")
    if not r.ok:
        logger.error(f"Video status failed: {r.status_code} {r.text[:200]}")
        raise HTTPException(status_code=502, detail="Statut de la vidéo indisponible")
    j = r.json()
    return {
        "exists": True,
        "status": j.get("status"),
        "encodeProgress": j.get("encodeProgress", 0),
        "availableResolutions": j.get("availableResolutions"),
        "libraryId": resolved_library_id,
    }


@api_router.delete("/bunny/videos/{video_id}")
async def bunny_delete_video(
    video_id: str,
    library_id: Optional[str] = Query(None),
    user: dict = Depends(require_admin),
):
    """Annule un téléversement YourMovie's et supprime sa vidéo hébergée, même partielle."""
    if not BUNNY_CONFIGURED:
        raise HTTPException(status_code=500, detail="Hébergeur vidéo non configuré")
    resolved_library_id = _validated_bunny_library_id(library_id)
    r = await run_in_threadpool(lambda: requests.delete(
        f"https://video.bunnycdn.com/library/{resolved_library_id}/videos/{video_id}",
        headers={"AccessKey": BUNNY_API_KEY}, timeout=30,
    ))
    if r.status_code not in (200, 204, 404):
        logger.error(f"Video delete failed: {r.status_code} {r.text[:200]}")
        raise HTTPException(status_code=502, detail="Suppression impossible")
    await _remove_bunny_reference(video_id, resolved_library_id)
    return {"ok": True, "alreadyDeleted": r.status_code == 404}

def _bunny_references_of(media: dict) -> list:
    """Toutes les vidéos hébergées d'un contenu : le fichier principal et chaque épisode."""
    trouvees = []
    vus = set()

    def ajouter(doc):
        if not isinstance(doc, dict):
            return
        video_id = str(doc.get("bunny_video_id") or "").strip()
        if not video_id or video_id in vus:
            return
        vus.add(video_id)
        library_id = str(doc.get("bunny_library_id") or BUNNY_LIBRARY_ID or "").strip()
        trouvees.append((video_id, library_id))

    ajouter(media)
    for season in media.get("seasons") or []:
        if isinstance(season, dict):
            for episode in season.get("episodes") or []:
                ajouter(episode)
    return trouvees


async def _delete_bunny_video(video_id: str, library_id: str) -> bool:
    """Supprime une vidéo côté hébergeur. Best-effort : un échec ne doit jamais
    empêcher la suppression du contenu dans le catalogue."""
    if not BUNNY_CONFIGURED or not video_id:
        return False
    library = str(library_id or BUNNY_LIBRARY_ID or "").strip()
    if not re.fullmatch(r"\d+", library):
        return False
    try:
        r = await run_in_threadpool(lambda: requests.delete(
            f"https://video.bunnycdn.com/library/{library}/videos/{video_id}",
            headers={"AccessKey": BUNNY_API_KEY}, timeout=30,
        ))
        if r.status_code in (200, 204, 404):
            return True
        logger.error("Suppression refusée par l'hébergeur pour %s : %s %s", video_id, r.status_code, r.text[:200])
    except Exception as exc:
        logger.error("Suppression impossible chez l'hébergeur pour %s : %s", video_id, exc)
    return False


async def _purge_bunny_of(media: dict) -> int:
    supprimees = 0
    for video_id, library_id in _bunny_references_of(media):
        if await _delete_bunny_video(video_id, library_id):
            supprimees += 1
    return supprimees


async def _bunny_library_videos(library_id: str) -> list:
    """Liste complète de la bibliothèque, page par page."""
    videos = []
    page = 1
    while page <= 100:
        r = await run_in_threadpool(lambda: requests.get(
            f"https://video.bunnycdn.com/library/{library_id}/videos",
            headers={"AccessKey": BUNNY_API_KEY},
            params={"page": page, "itemsPerPage": 100},
            timeout=30,
        ))
        if not r.ok:
            raise HTTPException(status_code=502, detail="Bibliothèque vidéo illisible")
        payload = r.json()
        lot = payload.get("items") or []
        videos.extend(lot)
        if len(lot) < 100:
            break
        page += 1
    return videos


async def _referenced_bunny_ids() -> set:
    """Identifiants encore utilisés par au moins un contenu du catalogue."""
    utilises = set()
    docs = await db.media.find({}, {"_id": 0, "bunny_video_id": 1, "seasons": 1}).to_list(100000)
    for doc in docs:
        for video_id, _ in _bunny_references_of(doc):
            utilises.add(video_id)
    return utilises


def _resolve_bunny_reference(doc: dict) -> tuple[Optional[str], Optional[str]]:
    """Normalise un GUID ou une URL d'embed sans faire confiance au client."""
    library_id = str(doc.get("bunny_library_id") or BUNNY_LIBRARY_ID or "").strip()
    for candidate in (doc.get("bunny_video_id"), doc.get("video_url")):
        raw = str(candidate or "").strip()
        if not raw:
            continue
        match = re.search(r"/(?:embed|play)/(\d+)/([A-Za-z0-9-]+)", raw)
        if match:
            return match.group(1), match.group(2)
        if re.fullmatch(r"[A-Za-z0-9-]{12,}", raw):
            return library_id or None, raw
    return None, None

@api_router.get("/bunny/playback/{media_id}")
async def bunny_playback(
    media_id: str,
    season_number: Optional[str] = Query(None),
    episode_number: Optional[str] = Query(None),
):
    """Retourne l'URL temporaire du film ou de l'épisode demandé."""
    doc = await db.media.find_one({"id": media_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Contenu introuvable")

    playback_doc = doc
    if doc.get("type") in {"series", "anime"}:
        requested_episode = None
        if season_number is not None and episode_number is not None:
            for season in doc.get("seasons") or []:
                if str(season.get("season_number")) != str(season_number):
                    continue
                requested_episode = next(
                    (
                        episode for episode in season.get("episodes") or []
                        if str(episode.get("ep_number")) == str(episode_number)
                    ),
                    None,
                )
                break
            if not requested_episode:
                raise HTTPException(status_code=404, detail="Épisode introuvable")
        else:
            requested_episode = next(
                (
                    episode
                    for season in doc.get("seasons") or []
                    for episode in season.get("episodes") or []
                    if _resolve_bunny_reference(episode)[1]
                ),
                None,
            )
        if not requested_episode:
            raise HTTPException(status_code=404, detail="Aucun fichier vidéo associé à cet épisode")
        playback_doc = requested_episode

    library_id, video_id = _resolve_bunny_reference(playback_doc)
    if not library_id or not video_id:
        raise HTTPException(status_code=404, detail="Aucun fichier vidéo associé à ce contenu")

    expires = int(time.time()) + 4 * 60 * 60
    params = "autoplay=true&preload=true&responsive=true"
    if BUNNY_TOKEN_AUTH_KEY:
        token = hashlib.sha256(f"{BUNNY_TOKEN_AUTH_KEY}{video_id}{expires}".encode()).hexdigest()
        params = f"token={token}&expires={expires}&{params}"

    playback_url = f"https://iframe.mediadelivery.net/embed/{library_id}/{video_id}?{params}"
    return {
        "url": playback_url,
        "expires": expires if BUNNY_TOKEN_AUTH_KEY else None,
        "signed": bool(BUNNY_TOKEN_AUTH_KEY),
        "libraryId": library_id,
        "videoId": video_id,
        # Indications non sensibles utilisées par le lecteur pour afficher un diagnostic utile.
        "tokenAuthenticationConfigured": bool(BUNNY_TOKEN_AUTH_KEY),
        "libraryMatchesUploadConfig": str(library_id) == str(BUNNY_LIBRARY_ID or ""),
    }

# ---------- Plans (abonnements gérés manuellement via Discord) ----------

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
            "monthly": {"lookup_key": "ym_basic_monthly", "amount": 2.99, "currency": "eur"},
            "yearly": {"lookup_key": "ym_basic_yearly", "amount": 35.88, "currency": "eur"},
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
            "monthly": {"lookup_key": "ym_standard_monthly", "amount": 5.99, "currency": "eur"},
            "yearly": {"lookup_key": "ym_standard_yearly", "amount": 71.88, "currency": "eur"},
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
            "monthly": {"lookup_key": "ym_premium_monthly", "amount": 12.99, "currency": "eur"},
            "yearly": {"lookup_key": "ym_premium_yearly", "amount": 155.88, "currency": "eur"},
        },
    },
]

@api_router.get("/plans")
async def list_plans():
    return await _effective_plans()

@api_router.get("/premium/offer")
async def premium_offer(user: dict = Depends(get_current_user)):
    return await _welcome_offer(user)

class PricingInput(BaseModel):
    premium: Optional[dict] = None
    coins: Optional[dict] = None
    welcome: Optional[dict] = None

async def _pricing_payload() -> dict:
    return {
        "premium": await _effective_plans(),
        "coins": await _effective_coin_plans(),
        "welcome": await _welcome_config(),
    }

@api_router.get("/admin/pricing")
async def get_admin_pricing(admin: dict = Depends(require_perm("pricing.manage"))):
    return await _pricing_payload()

@api_router.post("/admin/pricing")
async def set_admin_pricing(inp: PricingInput, admin: dict = Depends(require_perm("pricing.manage"))):
    update = {}
    if inp.premium is not None:
        clean = {}
        for pid, intervals in (inp.premium or {}).items():
            if pid not in {"basic", "standard", "premium"} or not isinstance(intervals, dict):
                continue
            row = {}
            for interval in ("monthly", "yearly"):
                if interval in intervals:
                    try:
                        row[interval] = round(float(intervals[interval]), 2)
                    except Exception:
                        pass
            if row:
                clean[pid] = row
        update["premium"] = clean
    if inp.coins is not None:
        clean = {}
        for pid, opts in (inp.coins or {}).items():
            if pid not in {"basic", "standard", "premium"} or not isinstance(opts, list):
                continue
            arr = []
            for o in opts:
                try:
                    arr.append({"days": int(o["days"]), "coins": int(round(float(o["coins"])))})
                except Exception:
                    pass
            if arr:
                clean[pid] = arr
        update["coins"] = clean
    if inp.welcome is not None:
        w = inp.welcome or {}
        wc = {}
        try:
            if "pct" in w:
                wc["pct"] = max(0.0, min(100.0, float(w["pct"])))
        except Exception:
            pass
        try:
            if "hours" in w:
                wc["hours"] = max(0.0, float(w["hours"]))
        except Exception:
            pass
        if "enabled" in w:
            wc["enabled"] = bool(w["enabled"])
        update["welcome"] = wc
    if update:
        await db.settings.update_one({"id": "pricing"}, {"$set": update}, upsert=True)
    return await _pricing_payload()

# ---------- Publicité ----------
class AdsInput(BaseModel):
    enabled: Optional[bool] = None
    preroll: Optional[dict] = None
    banner: Optional[dict] = None
    popunder: Optional[dict] = None
    gate: Optional[dict] = None
    reward: Optional[dict] = None
    campaigns: Optional[list] = None

# ---------- Audience du site (compteurs anonymes) ----------
class VisitPing(BaseModel):
    new_visitor: bool = False

@api_router.post("/site/ping")
async def site_ping(inp: VisitPing):
    """Incrémente les compteurs du jour. Aucune donnée personnelle : ni IP, ni
    identifiant — seulement deux nombres par journée."""
    today = datetime.now(timezone.utc).date().isoformat()
    inc = {"views": 1}
    if inp.new_visitor:
        inc["visitors"] = 1
    await db.site_stats.update_one({"id": today}, {"$inc": inc, "$set": {"date": today}}, upsert=True)
    return {"ok": True}

@api_router.get("/admin/site-stats")
async def admin_site_stats(admin: dict = Depends(require_admin)):
    today = datetime.now(timezone.utc).date()
    docs = await db.site_stats.find({}, {"_id": 0}).to_list(1000)
    by_date = {d.get("date") or d.get("id"): d for d in docs}

    def bucket(day):
        d = by_date.get(day.isoformat()) or {}
        return {"date": day.isoformat(), "views": int(d.get("views", 0) or 0), "visitors": int(d.get("visitors", 0) or 0)}

    series = [bucket(today - timedelta(days=i)) for i in range(13, -1, -1)]
    def total_over(days):
        return sum(bucket(today - timedelta(days=i))["views"] for i in range(days))
    def visitors_over(days):
        return sum(bucket(today - timedelta(days=i))["visitors"] for i in range(days))

    return {
        "today": bucket(today),
        "last7": {"views": total_over(7), "visitors": visitors_over(7)},
        "last30": {"views": total_over(30), "visitors": visitors_over(30)},
        "total": {
            "views": sum(int(d.get("views", 0) or 0) for d in docs),
            "visitors": sum(int(d.get("visitors", 0) or 0) for d in docs),
        },
        "series": series,
    }

@api_router.get("/promo/config")
async def public_promo_config():
    """Config publicitaire — publique : les visiteurs non connectés doivent la lire.
    Le chemin évite volontairement le mot « ads », bloqué par les bloqueurs de publicité."""
    return await _effective_ads()

@api_router.get("/ads/config")
async def public_ads_config():
    """Ancien chemin, conservé pour compatibilité (souvent bloqué côté navigateur)."""
    return await _effective_ads()

@api_router.get("/admin/ads")
async def get_admin_ads(admin: dict = Depends(require_perm("ads.manage"))):
    return await _effective_ads()

@api_router.post("/admin/ads")
async def set_admin_ads(inp: AdsInput, admin: dict = Depends(require_perm("ads.manage"))):
    update = {}
    if inp.enabled is not None:
        update["enabled"] = bool(inp.enabled)
    if inp.preroll is not None:
        p = inp.preroll or {}
        duration = _clamp_num(p.get("duration"), 5, 60, 15)
        update["preroll"] = {
            "enabled": bool(p.get("enabled")),
            "vast_tag_url": _https_url(p.get("vast_tag_url")),
            "duration": int(duration),
            "skip_after": int(_clamp_num(p.get("skip_after"), 0, duration, 5)),
            "frequency_minutes": int(_clamp_num(p.get("frequency_minutes"), 0, 1440, 30)),
        }
    if inp.banner is not None:
        b = inp.banner or {}
        update["banner"] = {"enabled": bool(b.get("enabled")), "script_url": _https_url(b.get("script_url"))}
    if inp.popunder is not None:
        pu = inp.popunder or {}
        update["popunder"] = {
            "enabled": bool(pu.get("enabled")),
            "script_url": _https_url(pu.get("script_url")),
            "frequency_hours": int(_clamp_num(pu.get("frequency_hours"), 1, 168, 12)),
        }
    if inp.gate is not None:
        g = inp.gate or {}
        update["gate"] = {
            "enabled": bool(g.get("enabled")),
            "steps": int(_clamp_num(g.get("steps"), 1, 5, 1)),
            "seconds": int(_clamp_num(g.get("seconds"), 0, 15, 3)),
            "frequency_minutes": int(_clamp_num(g.get("frequency_minutes"), 0, 1440, 60)),
            "direct_link": _https_url(g.get("direct_link")),
        }
    if inp.reward is not None:
        r = inp.reward or {}
        update["reward"] = {
            "enabled": bool(r.get("enabled")),
            "coins": round(_clamp_num(r.get("coins"), 0.5, 50, 1), 1),
            "watch_seconds": int(_clamp_num(r.get("watch_seconds"), 5, 120, 20)),
            "cooldown_minutes": int(_clamp_num(r.get("cooldown_minutes"), 0, 1440, 10)),
            "daily_max": int(_clamp_num(r.get("daily_max"), 1, 100, 10)),
        }
    if inp.campaigns is not None:
        update["campaigns"] = [c for c in (
            _clean_campaign(entry, i) for i, entry in enumerate(inp.campaigns or [])
        ) if c]
    if update:
        await db.settings.update_one({"id": "ads"}, {"$set": update}, upsert=True)
    return await _effective_ads()

# ---------- Clés SellAuth ----------
@api_router.get("/admin/license-keys")
async def admin_list_license_keys(limit: int = Query(200, ge=1, le=500), admin: dict = Depends(require_perm("keys.manage"))):
    docs = await db.license_keys.find({}, {"_id": 0, "key_hash": 0}).sort("created_at", -1).to_list(limit)
    total, available, redeemed, revoked = await asyncio.gather(
        db.license_keys.count_documents({}),
        db.license_keys.count_documents({"redeemed_at": None, "revoked_at": None}),
        db.license_keys.count_documents({"redeemed_at": {"$ne": None}, "revoked_at": None}),
        db.license_keys.count_documents({"revoked_at": {"$ne": None}}),
    )
    return {
        "items": [_license_key_admin_dict(doc) for doc in docs],
        "stats": {"total": total, "available": available, "redeemed": redeemed, "revoked": revoked},
    }

@api_router.post("/admin/license-keys")
async def admin_add_license_keys(inp: AdminLicenseKeysInput, admin: dict = Depends(require_perm("keys.manage"))):
    raw_keys = [line.strip() for line in inp.keys.splitlines() if line.strip()]
    if not raw_keys:
        raise HTTPException(status_code=422, detail="Ajoutez au moins une clé")
    if len(raw_keys) > 5000:
        raise HTTPException(status_code=422, detail="Maximum 5 000 clés par import")

    unique_hashes = []
    seen = set()
    for raw_key in raw_keys:
        key_hash = _license_key_hash(raw_key)
        if key_hash not in seen:
            seen.add(key_hash)
            unique_hashes.append(key_hash)

    duration_days = 365 if inp.billing_cycle == "yearly" else 30
    now = datetime.now(timezone.utc).isoformat()
    operations = [
        UpdateOne(
            {"key_hash": key_hash},
            {"$setOnInsert": {
                "id": f"lk_{key_hash[:24]}",
                "key_hash": key_hash,
                "plan": inp.plan,
                "duration_days": duration_days,
                "billing_cycle": inp.billing_cycle,
                "source": "admin",
                "created_at": now,
                "created_by": admin["user_id"],
                "redeemed_at": None,
                "revoked_at": None,
            }},
            upsert=True,
        )
        for key_hash in unique_hashes
    ]
    result = await db.license_keys.bulk_write(operations, ordered=False)
    added = int(result.upserted_count or 0)
    return {"ok": True, "added": added, "duplicates": len(unique_hashes) - added}

@api_router.post("/admin/license-keys/revoke")
async def admin_revoke_license_key(inp: LicenseActivationInput, admin: dict = Depends(require_perm("keys.manage"))):
    key_hash = _license_key_hash(inp.key)
    now = datetime.now(timezone.utc).isoformat()
    result = await db.license_keys.update_one(
        {"key_hash": key_hash, "revoked_at": None},
        {"$set": {"revoked_at": now, "revoked_by": admin["user_id"]}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Clé introuvable ou déjà retirée")
    return {"ok": True}

@api_router.delete("/admin/license-keys/{license_key_id}")
async def admin_revoke_license_key_by_id(license_key_id: str, admin: dict = Depends(require_perm("keys.manage"))):
    now = datetime.now(timezone.utc).isoformat()
    result = await db.license_keys.update_one(
        {"id": license_key_id, "revoked_at": None},
        {"$set": {"revoked_at": now, "revoked_by": admin["user_id"]}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Clé introuvable ou déjà retirée")
    return {"ok": True}

def _entitlement_date(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except Exception:
        return None

@api_router.post("/license/activate")
async def activate_license_key(inp: LicenseActivationInput, user: dict = Depends(get_current_user)):
    key_hash = _license_key_hash(inp.key)
    license_key = await db.license_keys.find_one({"key_hash": key_hash}, {"_id": 0})
    if not license_key or license_key.get("revoked_at"):
        raise HTTPException(status_code=404, detail="Clé invalide ou désactivée")
    if license_key.get("redeemed_at"):
        raise HTTPException(status_code=409, detail="Cette clé a déjà été utilisée")

    now = datetime.now(timezone.utc)
    plan = license_key["plan"]
    duration_days = int(license_key.get("duration_days", 30) or 30)
    starts_at = now
    account_until = _entitlement_date(user.get("premium_until"))
    if user.get("premium_plan") == plan and account_until and account_until > starts_at:
        starts_at = account_until
    for entitlement in user.get("license_entitlements", []) or []:
        if isinstance(entitlement, dict) and entitlement.get("plan") == plan:
            entitlement_until = _entitlement_date(entitlement.get("until"))
            if entitlement_until and entitlement_until > starts_at:
                starts_at = entitlement_until
    premium_until = starts_at + timedelta(days=duration_days)
    now_iso = now.isoformat()
    until_iso = premium_until.isoformat()

    claimed = await db.license_keys.find_one_and_update(
        {"key_hash": key_hash, "redeemed_at": None, "revoked_at": None},
        {"$set": {
            "redeemed_at": now_iso,
            "redeemed_by": user["user_id"],
            "redeemed_until": until_iso,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if not claimed:
        raise HTTPException(status_code=409, detail="Cette clé a déjà été utilisée")

    entitlement = {
        "license_key_id": claimed["id"],
        "plan": plan,
        "billing_cycle": claimed.get("billing_cycle"),
        "activated_at": now_iso,
        "until": until_iso,
    }
    try:
        user_update = await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$push": {"license_entitlements": entitlement}},
        )
        if user_update.matched_count == 0:
            raise RuntimeError("Compte introuvable pendant l'activation")
    except Exception:
        await db.license_keys.update_one(
            {"id": claimed["id"], "redeemed_by": user["user_id"], "redeemed_at": now_iso},
            {"$set": {"redeemed_at": None, "redeemed_by": None, "redeemed_until": None}},
        )
        raise
    return {
        "ok": True,
        "plan": plan,
        "billing_cycle": claimed.get("billing_cycle"),
        "premium_until": until_iso,
    }

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
    raise HTTPException(status_code=410, detail="Le paiement en ligne a été retiré. Les abonnements sont gérés via Discord.")
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
    raise HTTPException(status_code=410, detail="Le système Stripe a été retiré.")
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
    raise HTTPException(status_code=410, detail="Le système Stripe a été retiré.")
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
async def set_cagnotte(inp: CagnotteSetInput, admin: dict = Depends(require_perm("cagnotte.manage"))):
    total = max(0.0, round(float(inp.total), 2))
    await db.cagnotte.update_one({"id": "main"}, {"$set": {"total": total, "goal": CAGNOTTE_GOAL}}, upsert=True)
    return await _get_cagnotte()

@api_router.post("/cagnotte/contribute")
async def contribute_cagnotte(inp: ContributeInput, user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=410, detail="La cagnotte est désormais gérée manuellement via Discord.")
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
    season_number: Optional[int] = None
    episode_number: Optional[int] = None

class WatchProgressStartInput(BaseModel):
    media_id: str
    duration_seconds: Optional[float] = None
    season_number: Optional[int] = None
    episode_number: Optional[int] = None

WATCH_ACTIVITY_TTL_SECONDS = 150

async def _touch_watch_activity(
    user_id: str,
    profile_id: Optional[str],
    media_id: str,
    season_number: Optional[int],
    episode_number: Optional[int],
):
    update = {
        "user_id": user_id,
        "profile_id": profile_id,
        "media_id": media_id,
        "season_number": season_number,
        "episode_number": episode_number,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.watch_activity.update_one(
        {"user_id": user_id},
        {"$set": update},
        upsert=True,
    )

@api_router.post("/watch-progress/start")
async def start_progress(inp: WatchProgressStartInput, user: dict = Depends(get_current_user), profile_id: Optional[str] = Depends(current_profile_id)):
    key = {"user_id": user["user_id"], "media_id": inp.media_id, "profile_id": profile_id}
    previous = await db.watch_progress.find_one(key, {"_id": 0})
    same_selection = bool(
        previous
        and previous.get("season_number") == inp.season_number
        and previous.get("episode_number") == inp.episode_number
    )
    update = {
        "user_id": user["user_id"],
        "profile_id": profile_id,
        "media_id": inp.media_id,
        "season_number": inp.season_number,
        "episode_number": inp.episode_number,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if same_selection:
        if inp.duration_seconds and not previous.get("duration_seconds"):
            update["duration_seconds"] = inp.duration_seconds
    else:
        update["position_seconds"] = 0
        update["duration_seconds"] = inp.duration_seconds
    await db.watch_progress.update_one(key, {"$set": update}, upsert=True)
    await _touch_watch_activity(
        user["user_id"], profile_id, inp.media_id,
        inp.season_number, inp.episode_number,
    )
    await db.recommendation_dismissals.delete_one(key)
    return {"ok": True}

@api_router.post("/watch-progress/activity")
async def heartbeat_watch_activity(inp: WatchProgressStartInput, user: dict = Depends(get_current_user), profile_id: Optional[str] = Depends(current_profile_id)):
    await _touch_watch_activity(
        user["user_id"], profile_id, inp.media_id,
        inp.season_number, inp.episode_number,
    )
    return {"ok": True}

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
            "season_number": inp.season_number,
            "episode_number": inp.episode_number,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    await _touch_watch_activity(
        user["user_id"], profile_id, inp.media_id,
        inp.season_number, inp.episode_number,
    )
    await db.recommendation_dismissals.delete_one({
        "user_id": user["user_id"],
        "profile_id": profile_id,
        "media_id": inp.media_id,
    })
    return {"ok": True}

def _flatten_episodes(media: dict) -> list:
    """Épisodes d'une série à plat, dans l'ordre saison puis numéro."""
    out = []
    for si, season in enumerate(media.get("seasons") or []):
        season_no = int(season.get("season_number") or si + 1)
        for ei, episode in enumerate(season.get("episodes") or []):
            out.append({
                "season_number": season_no,
                "episode_number": int(episode.get("ep_number") or ei + 1),
                "duration_minutes": episode.get("duration_minutes") or episode.get("duration"),
            })
    out.sort(key=lambda e: (e["season_number"], e["episode_number"]))
    return out

def _next_episode_of(media: dict, season_no, episode_no):
    episodes = _flatten_episodes(media)
    if not episodes or season_no is None or episode_no is None:
        return None
    for i, ep in enumerate(episodes):
        if ep["season_number"] == int(season_no) and ep["episode_number"] == int(episode_no):
            return episodes[i + 1] if i + 1 < len(episodes) else None
    return None

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
        position = d.get("position_seconds") or 0
        duration = d.get("duration_seconds")
        season_no = d.get("season_number")
        episode_no = d.get("episode_number")

        # Épisode terminé : on enchaîne sur le suivant plutôt que de faire
        # disparaître la série de « Continuer à regarder ».
        if m.get("type") != "movie" and duration and position / duration >= 0.95:
            nxt = _next_episode_of(m, season_no, episode_no)
            if nxt:
                season_no = nxt["season_number"]
                episode_no = nxt["episode_number"]
                position = 0
                duration = (int(nxt["duration_minutes"]) * 60) if nxt.get("duration_minutes") else None

        item["position_seconds"] = position
        item["duration_seconds"] = duration
        item["season_number"] = season_no
        item["episode_number"] = episode_no
        item["updated_at"] = d.get("updated_at")
        result.append(item)
    return result

@api_router.delete("/watch-progress/{media_id}")
async def delete_progress(media_id: str, user: dict = Depends(get_current_user), profile_id: Optional[str] = Depends(current_profile_id)):
    key = {
        "user_id": user["user_id"],
        "profile_id": profile_id,
        "media_id": media_id,
    }
    deleted = await db.watch_progress.delete_one(key)
    await db.recommendation_dismissals.update_one(
        key,
        {"$set": {
            **key,
            "dismissed_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True, "deleted": bool(deleted.deleted_count)}

@api_router.get("/recommendations")
async def recommendations(limit: int = 20, user: dict = Depends(get_current_user), profile_id: Optional[str] = Depends(current_profile_id)):
    limit = max(1, min(limit, 40))
    progress = await db.watch_progress.find(
        {"user_id": user["user_id"], "profile_id": profile_id},
        {"_id": 0, "media_id": 1},
    ).sort("updated_at", -1).to_list(30)
    watched_ids = [item.get("media_id") for item in progress if item.get("media_id")]
    if not watched_ids:
        return []
    dismissals = await db.recommendation_dismissals.find(
        {"user_id": user["user_id"], "profile_id": profile_id},
        {"_id": 0, "media_id": 1},
    ).to_list(200)
    dismissed_ids = [item.get("media_id") for item in dismissals if item.get("media_id")]
    excluded_ids = list(set(watched_ids + dismissed_ids))
    watched = await db.media.find({"id": {"$in": watched_ids}}, {"_id": 0, "genres": 1, "type": 1}).to_list(30)
    genre_weights = {}
    type_weights = {}
    for rank, item in enumerate(watched):
        weight = max(1, len(watched) - rank)
        type_weights[item.get("type")] = type_weights.get(item.get("type"), 0) + weight
        for genre in item.get("genres") or []:
            genre_weights[genre] = genre_weights.get(genre, 0) + weight
    candidates = await db.media.find({"id": {"$nin": excluded_ids}}, {"_id": 0}).sort("created_at", -1).to_list(200)
    def recommendation_score(item):
        score = type_weights.get(item.get("type"), 0)
        score += sum(genre_weights.get(genre, 0) * 3 for genre in item.get("genres") or [])
        score += float(item.get("rating") or 0)
        return score
    ranked = sorted(candidates, key=recommendation_score, reverse=True)
    return [serialize_media(item) for item in ranked[:limit] if recommendation_score(item) > 0]

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
    entitlement = _effective_premium_entitlement(user)
    plan = entitlement.get("plan") if entitlement else None
    premium_until = entitlement.get("until") if entitlement else None
    source = entitlement.get("source") if entitlement else None
    interval = user.get("premium_interval")
    if source == "license":
        active_license = next((item for item in (user.get("license_entitlements", []) or [])
            if isinstance(item, dict) and item.get("plan") == plan and item.get("until") == premium_until), None)
        interval = active_license.get("billing_cycle") if active_license else interval
    result = {
        "plan": plan,
        "interval": interval,
        "premium_until": premium_until,
        "source": source,
        "cancel_at_period_end": False,
        "next_billing_date": None,
        "amount": None,
        "currency": None,
        "status": None,
        "stripe_subscription_id": None,
    }
    return result

@api_router.post("/subscription/cancel")
async def cancel_subscription(user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=410, detail="Les abonnements sont gérés manuellement via Discord.")
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
    raise HTTPException(status_code=410, detail="Les abonnements sont gérés manuellement via Discord.")
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
async def admin_list_users(user: dict = Depends(require_perm("users.view"))):
    await _purge_expired_blocked()
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return [user_public_dict(u) | {"created_at": u.get("created_at")} for u in users]

@api_router.get("/admin/users/{user_id}")
async def admin_get_user(user_id: str, admin: dict = Depends(require_perm("users.view"))):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    review_count = await db.reviews.count_documents({"user_id": user_id, "parent_id": None})
    return user_public_dict(u) | {"created_at": u.get("created_at"), "review_count": review_count}

@api_router.get("/admin/users/{user_id}/watching")
async def admin_get_user_watching(user_id: str, admin: dict = Depends(require_perm("users.view"))):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "user_id": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    activity = await db.watch_activity.find_one(
        {"user_id": user_id},
        {"_id": 0},
    )
    if not activity or not activity.get("updated_at"):
        return {"watching": False}

    try:
        updated_at = datetime.fromisoformat(str(activity["updated_at"]).replace("Z", "+00:00"))
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return {"watching": False}

    age_seconds = (datetime.now(timezone.utc) - updated_at).total_seconds()
    if age_seconds > WATCH_ACTIVITY_TTL_SECONDS:
        return {"watching": False}

    media = await db.media.find_one(
        {"id": activity.get("media_id")},
        {"_id": 0, "id": 1, "title": 1, "type": 1, "poster_url": 1, "banner_url": 1, "seasons": 1},
    )
    if not media:
        return {"watching": False}

    season_number = activity.get("season_number")
    episode_number = activity.get("episode_number")
    episode_title = None
    if media.get("type") != "movie" and season_number is not None and episode_number is not None:
        for season in media.get("seasons") or []:
            if str(season.get("season_number")) != str(season_number):
                continue
            for episode in season.get("episodes") or []:
                if str(episode.get("ep_number")) == str(episode_number):
                    episode_title = episode.get("title") or None
                    break
            break

    profile_name = None
    if activity.get("profile_id"):
        profile = await db.profiles.find_one(
            {"id": activity["profile_id"], "user_id": user_id},
            {"_id": 0, "name": 1},
        )
        profile_name = (profile or {}).get("name")

    progress = await db.watch_progress.find_one(
        {
            "user_id": user_id,
            "profile_id": activity.get("profile_id"),
            "media_id": activity.get("media_id"),
        },
        {"_id": 0, "position_seconds": 1, "duration_seconds": 1},
    ) or {}
    position_seconds = progress.get("position_seconds")
    duration_seconds = progress.get("duration_seconds")
    position_seconds = max(0, float(position_seconds or 0))
    duration_seconds = max(0, float(duration_seconds or 0))
    progress_percent = round(min(100, position_seconds / duration_seconds * 100), 1) if duration_seconds > 0 else None

    return {
        "watching": True,
        "media": {
            "id": media["id"],
            "title": media.get("title") or "Sans titre",
            "type": media.get("type") or "movie",
            "poster_url": media.get("poster_url"),
            "banner_url": media.get("banner_url"),
        },
        "profile_name": profile_name,
        "season_number": season_number,
        "episode_number": episode_number,
        "episode_title": episode_title,
        "position_seconds": position_seconds,
        "duration_seconds": duration_seconds,
        "progress_percent": progress_percent,
        "updated_at": updated_at.isoformat(),
    }

@api_router.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, inp: AdminUserUpdate, admin: dict = Depends(require_perm("users.edit"))):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if _is_superadmin_locked(target) and admin["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Ce compte super-administrateur protégé ne peut être modifié que par son propriétaire.")
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
        if inp.password:
            await db.auth_sessions.update_many(
                {"user_id": user_id, "revoked_at": None},
                {"$set": {"revoked_at": datetime.now(timezone.utc)}},
            )
    updated = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return user_public_dict(updated) | {"created_at": updated.get("created_at")}

class AdminRoleInput(BaseModel):
    role: Optional[Literal["editor", "moderator", "super", "none"]] = None
    perms: Optional[List[str]] = None

@api_router.get("/admin/permissions")
async def admin_list_permissions(admin: dict = Depends(require_perm("roles.manage"))):
    return {"all": ALL_PERMS, "presets": ROLE_PRESETS}

@api_router.post("/admin/users/{user_id}/role")
async def admin_set_role(user_id: str, inp: AdminRoleInput, admin: dict = Depends(require_perm("roles.manage"))):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Not found")
    if _is_superadmin_locked(target):
        raise HTTPException(status_code=403, detail="Ce compte est super-admin protégé et ne peut pas être modifié.")

    if inp.perms is not None:
        perms = [p for p in inp.perms if p in ALL_PERMS]
        if perms:
            await db.users.update_one({"user_id": user_id}, {"$set": {"is_admin": True, "admin_perms": perms, "admin_role": None}})
        else:
            await db.users.update_one({"user_id": user_id}, {"$set": {"is_admin": False, "admin_perms": [], "admin_role": None}})
    elif inp.role == "none":
        await db.users.update_one({"user_id": user_id}, {"$set": {"is_admin": False, "admin_perms": [], "admin_role": None}})
    elif inp.role in ROLE_PRESETS:
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "is_admin": True, "admin_perms": list(ROLE_PRESETS[inp.role]), "admin_role": inp.role,
        }})
    else:
        raise HTTPException(status_code=400, detail="Fournis « perms » ou « role ».")

    fresh = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {
        "admin_perms": sorted(_admin_perms(fresh)),
        "admin_role": _admin_role(fresh),
        "is_admin": bool(_admin_perms(fresh)),
    }

@api_router.post("/admin/users/{user_id}/toggle-premium")
async def admin_toggle_premium(user_id: str, admin: dict = Depends(require_perm("users.premium"))):
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
async def admin_set_premium(user_id: str, inp: AdminPremiumInput, admin: dict = Depends(require_perm("users.premium"))):
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
    await db.watch_activity.delete_many({"user_id": user_id})
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
async def admin_dedupe(admin: dict = Depends(require_perm("users.delete"))):
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
async def admin_toggle_block(user_id: str, admin: dict = Depends(require_perm("users.block"))):
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
async def admin_delete_user(user_id: str, admin: dict = Depends(require_perm("users.delete"))):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    await _delete_user_data(user_id)
    return {"ok": True}

# ---------- Settings ----------
class SettingsInput(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=40)
    bio: Optional[str] = Field(default=None, max_length=500)
    picture: Optional[str] = Field(default=None, max_length=2048)
    banner: Optional[str] = Field(default=None, max_length=2048)
    preferred_quality: Optional[str] = None
    autoplay_hero: Optional[bool] = None
    accent_color: Optional[str] = None
    profile_background_color: Optional[str] = None
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
    if inp.banner is not None:
        upd["banner"] = inp.banner
    if inp.preferred_quality is not None:
        upd["preferred_quality"] = inp.preferred_quality
    if inp.autoplay_hero is not None:
        if not user_public_dict(user)["premium"]:
            raise HTTPException(status_code=403, detail="Bande-annonce cinéma réservée aux abonnés Premium")
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
    if inp.profile_background_color is not None:
        if not user_public_dict(user)["premium"]:
            raise HTTPException(status_code=403, detail="Couleur de fond du profil réservée aux abonnés Premium")
        color = inp.profile_background_color.strip().upper()
        if not re.fullmatch(r"#[0-9A-F]{6}", color):
            raise HTTPException(status_code=400, detail="La couleur de fond doit être au format hexadécimal #RRGGBB")
        upd["profile_background_color"] = color
    if not upd:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": upd})
    fresh = await get_user_by_id(user["user_id"])
    return user_public_dict(fresh)

@api_router.post("/settings/pin")
async def set_pin(inp: PinInput, request: Request, user: dict = Depends(get_current_user)):
    await _enforce_rate_limit(request, f"account-pin:{user['user_id']}", 8, 900)
    if not inp.pin or not inp.pin.isdigit() or not (4 <= len(inp.pin) <= 6):
        raise HTTPException(status_code=400, detail="Le PIN doit être 4 à 6 chiffres")
    existing_hash = user.get("pin_hash")
    if existing_hash:
        if not inp.current_pin or not verify_password(inp.current_pin, existing_hash):
            raise HTTPException(status_code=401, detail="PIN actuel incorrect")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"pin_hash": hash_password(inp.pin)}})
    return {"ok": True}

@api_router.delete("/settings/pin")
async def remove_pin(inp: PinInput, request: Request, user: dict = Depends(get_current_user)):
    await _enforce_rate_limit(request, f"account-pin:{user['user_id']}", 8, 900)
    if not user.get("pin_hash"):
        raise HTTPException(status_code=400, detail="Aucun PIN défini")
    if not verify_password(inp.pin, user["pin_hash"]):
        raise HTTPException(status_code=401, detail="PIN incorrect")
    await db.users.update_one({"user_id": user["user_id"]}, {"$unset": {"pin_hash": ""}})
    return {"ok": True}

@api_router.post("/settings/verify-pin")
async def verify_user_pin(inp: PinInput, request: Request, user: dict = Depends(get_current_user)):
    await _enforce_rate_limit(request, f"account-pin:{user['user_id']}", 8, 900)
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
async def verify_profile_pin(profile_id: str, inp: ProfilePinInput, request: Request, user: dict = Depends(get_current_user)):
    await _enforce_rate_limit(request, f"profile-pin:{user['user_id']}:{profile_id}", 8, 900)
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
        # La séance ne démarre que lorsque l'hôte l'autorise, et il ne peut le
        # faire qu'une fois toutes les publicités des participants terminées.
        self.started = False
        self.connections: List[dict] = []

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
PARTY_TTL_HOURS = 12
_party_state_saved: dict = {}

async def _load_party(code: str) -> Optional["Party"]:
    """Un salon vit en mémoire, mais il est aussi persisté : sans cela, tout
    redéploiement ou mise en veille du serveur le ferait disparaître et
    personne ne pourrait plus rejoindre."""
    party = PARTIES.get(code)
    if party:
        return party
    doc = await db.parties.find_one({"code": code}, {"_id": 0})
    if not doc:
        return None
    created = doc.get("created_at")
    try:
        dt = datetime.fromisoformat(created) if isinstance(created, str) else created
        if dt and dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt and (datetime.now(timezone.utc) - dt) > timedelta(hours=PARTY_TTL_HOURS):
            await db.parties.delete_one({"code": code})
            return None
    except Exception:
        pass
    party = Party(code=code, media_id=doc.get("media_id", ""), host_id=doc.get("host_id", ""))
    if isinstance(doc.get("state"), dict):
        party.state = doc["state"]
    PARTIES[code] = party
    return party

async def _persist_party_state(party: "Party") -> None:
    """Sauvegarde throttlée : la position bouge toutes les 2 s côté hôte."""
    now = time.time()
    if now - _party_state_saved.get(party.code, 0) < 5:
        return
    _party_state_saved[party.code] = now
    try:
        await db.parties.update_one({"code": party.code}, {"$set": {"state": party.state}})
    except Exception:
        pass

class PartyCreateInput(BaseModel):
    media_id: str

@api_router.post("/party/create")
async def create_party(inp: PartyCreateInput, user: dict = Depends(get_current_user)):
    code = uuid.uuid4().hex[:6].upper()
    while code in PARTIES or await db.parties.find_one({"code": code}, {"_id": 0, "code": 1}):
        code = uuid.uuid4().hex[:6].upper()
    party = Party(code=code, media_id=inp.media_id, host_id=user["user_id"])
    PARTIES[code] = party
    await db.parties.insert_one({
        "code": code,
        "media_id": inp.media_id,
        "host_id": user["user_id"],
        "state": party.state,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"code": code, "media_id": inp.media_id}

@api_router.get("/party/{code}")
async def get_party(code: str, user: dict = Depends(get_current_user)):
    party = await _load_party(code.upper())
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
    return [{
        "user_id": c["user_id"],
        "name": c["name"],
        "is_host": c.get("account_id") == party.host_id,
        "needs_ads": bool(c.get("needs_ads")),
        "ads_done": bool(c.get("ads_done")),
    } for c in party.connections]

def _party_all_ready(party: "Party") -> bool:
    return all((not c.get("needs_ads")) or c.get("ads_done") for c in party.connections)

async def _close_party_if_host_gone(party: "Party", delay: int = 15) -> None:
    """Délai de grâce : une micro-coupure réseau chez l'hôte ne doit pas
    détruire le salon, seul un départ réel le ferme."""
    await asyncio.sleep(delay)
    if PARTIES.get(party.code) is not party:
        return
    if any(c.get("account_id") == party.host_id for c in party.connections):
        return
    await _close_party(party, "L'hôte a quitté le salon.")

async def _close_party(party: "Party", reason: str) -> None:
    """L'hôte parti, le salon n'a plus lieu d'être : tout le monde sort."""
    for c in list(party.connections):
        try:
            await c["ws"].send_json({"type": "party_closed", "reason": reason})
        except Exception:
            pass
        try:
            await c["ws"].close(code=4410)
        except Exception:
            pass
    party.connections.clear()
    PARTIES.pop(party.code, None)
    try:
        await db.parties.delete_one({"code": party.code})
    except Exception:
        pass

@app.websocket("/api/party/{code}/ws")
async def party_ws(websocket: WebSocket, code: str):
    code = code.upper()
    party = await _load_party(code)
    if not party:
        await websocket.close(code=4404)
        return

    allowed_origins = {o.strip() for o in os.environ.get("CORS_ORIGINS", "https://yourmovies.online").split(",") if o.strip()}
    origin = websocket.headers.get("origin")
    if origin not in allowed_origins:
        await websocket.close(code=4403)
        return
    await websocket.accept()
    try:
        auth = await asyncio.wait_for(websocket.receive_json(), timeout=10)
        if auth.get("type") != "auth" or not auth.get("token"):
            raise ValueError("auth required")
        payload = pyjwt.decode(auth["token"], JWT_SECRET, algorithms=[JWT_ALGO])
        jti = payload.get("jti")
        session = await db.auth_sessions.find_one({
            "jti_hash": _token_fingerprint(jti or ""),
            "user_id": payload.get("user_id"),
            "revoked_at": None,
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        })
        user = await get_user_by_id(payload.get("user_id")) if session else None
        if not user or user.get("blocked_at"):
            raise ValueError("invalid session")
    except Exception:
        await websocket.close(code=4401)
        return

    profile = auth.get("profile")
    account_id = user["user_id"]
    display_name = user.get("name", "Utilisateur")
    if profile:
        owned_profile = await db.profiles.find_one({"id": profile, "user_id": account_id}, {"_id": 0, "name": 1})
        if not owned_profile:
            await websocket.close(code=4403)
            return
        display_name = owned_profile.get("name") or display_name
    conn_id = f"{account_id}:{profile}" if profile else account_id
    needs_ads = not _is_premium(user)
    conn = {
        "ws": websocket, "user_id": conn_id, "account_id": account_id, "name": display_name,
        "needs_ads": needs_ads, "ads_done": not needs_ads,
    }
    party.connections.append(conn)

    # Send initial state + participant list
    await websocket.send_json({
        "type": "hello",
        "code": party.code,
        "media_id": party.media_id,
        "host_id": party.host_id,
        "state": party.state,
        "started": party.started,
        "you": {
            "user_id": conn["user_id"], "name": conn["name"],
            "is_host": account_id == party.host_id, "needs_ads": needs_ads,
        },
    })
    await party.broadcast({
        "type": "participants",
        "participants": _party_participants(party),
    })

    try:
        message_times = []
        while True:
            data = await websocket.receive_json()
            now_tick = time.monotonic()
            message_times = [stamp for stamp in message_times if now_tick - stamp < 10]
            if len(message_times) >= 20:
                await websocket.close(code=4429)
                break
            message_times.append(now_tick)
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
                    await _persist_party_state(party)
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
            elif t == "episode":
                # Changement d'épisode : réservé à l'hôte, répercuté sur tout le salon.
                if conn["account_id"] == party.host_id:
                    payload = {
                        "type": "episode",
                        "season_number": data.get("season_number"),
                        "episode_number": data.get("episode_number"),
                    }
                    party.state = {
                        "position_seconds": 0.0,
                        "playing": True,
                        "updated_at": datetime.now(timezone.utc).timestamp(),
                        "season_number": payload["season_number"],
                        "episode_number": payload["episode_number"],
                    }
                    await party.broadcast(payload, exclude_ws=websocket)
                    await _persist_party_state(party)
            elif t == "request_pause":
                # Un participant ne contrôle pas la lecture : il la demande à l'hôte.
                if conn["account_id"] != party.host_id:
                    for other in list(party.connections):
                        if other.get("account_id") == party.host_id:
                            try:
                                await other["ws"].send_json({
                                    "type": "pause_request",
                                    "name": conn["name"],
                                    "at": datetime.now(timezone.utc).timestamp(),
                                })
                            except Exception:
                                pass
            elif t == "request_state":
                await websocket.send_json({"type": "sync", "state": party.state})
            elif t == "ad_status":
                # Chaque participant annonce où il en est de ses publicités :
                # l'hôte les voit tous et ne peut lancer qu'une fois tous prêts.
                if conn.get("needs_ads"):
                    conn["ads_done"] = bool(data.get("done"))
                    await party.broadcast({
                        "type": "participants",
                        "participants": _party_participants(party),
                    })
            elif t == "start":
                if conn["account_id"] == party.host_id and _party_all_ready(party):
                    party.started = True
                    await party.broadcast({"type": "started"})
            elif t == "close":
                if conn["account_id"] == party.host_id:
                    await _close_party(party, "L'hôte a fermé le salon.")
                    break
            elif t == "kick":
                if conn["account_id"] == party.host_id:
                    target_id = str(data.get("user_id") or "")
                    for other in list(party.connections):
                        if other["user_id"] != target_id or other is conn:
                            continue
                        try:
                            await other["ws"].send_json({"type": "kicked"})
                        except Exception:
                            pass
                        try:
                            await other["ws"].close(code=4410)
                        except Exception:
                            pass
                        if other in party.connections:
                            party.connections.remove(other)
                    await party.broadcast({
                        "type": "participants",
                        "participants": _party_participants(party),
                    })
    except WebSocketDisconnect:
        pass
    finally:
        if conn in party.connections:
            party.connections.remove(conn)
        await party.broadcast({
            "type": "participants",
            "participants": _party_participants(party),
        })
        if conn["account_id"] == party.host_id:
            asyncio.create_task(_close_party_if_host_gone(party))
        elif not party.connections:
            PARTIES.pop(party.code, None)

# ---------- Root ----------
@api_router.get("/")
async def root():
    # Repère de version : sans lui, impossible de savoir depuis l'extérieur
    # quelle révision tourne réellement sur l'hébergeur.
    return {
        "message": "YourMovie's API",
        "commit": (os.environ.get("RENDER_GIT_COMMIT") or "")[:7],
    }

# ---------- Discord integration ----------
try:
    from .discord_api import create_discord_router
except ImportError:
    from discord_api import create_discord_router

api_router.include_router(create_discord_router(
    db=db,
    award_coins=award_coins,
    get_current_user=get_current_user,
    get_coin_plans=_effective_coin_plans,
))

# ---------- Wire ----------
app.include_router(api_router)

# CORS : jamais de credentials avec un wildcard. Si CORS_ORIGINS n'est pas défini
# (ou vaut '*'), on autorise '*' mais sans credentials pour éviter le fail-open.
_cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', 'https://yourmovies.online').split(',') if o.strip() and o.strip() != '*']
_cors_credentials = True
app.add_middleware(
    CORSMiddleware,
    allow_credentials=_cors_credentials,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Profile-Id", "X-Internal-API-Key"],
)

@app.on_event("startup")
async def startup():
    logger.info(f"Storage: {'Cloudinary configuré' if CLOUDINARY_CONFIGURED else 'AUCUN (CLOUDINARY_URL manquant)'}")
    # nettoyage des comptes en double (même email/pseudo) au démarrage
    try:
        await _dedupe_accounts()
    except Exception as e:
        logger.warning(f"Déduplication au démarrage échouée : {e}")
    try:
        await _migrate_coin_economy_v2()
    except Exception as e:
        logger.warning(f"Migration économie Freemium v2 échouée : {e}")
    try:
        await _migrate_premium_pricing_v3()
    except Exception as e:
        logger.warning(f"Migration tarifs Premium v3 échouée : {e}")
    try:
        await _migrate_account_identifiers()
    except Exception as e:
        logger.error(f"Migration des identifiants de compte échouée : {e}")
    # index uniques : bloque les doublons email / user_id (courses d'inscription).
    # En try/except : si des doublons existent déjà en base, on n'empêche pas le démarrage.
    try:
        await db.users.create_index("user_id", unique=True)
        await db.users.create_index("email", unique=True)
        await db.users.create_index("account_identifier", unique=True, sparse=True)
        await db.auth_sessions.create_index("jti_hash", unique=True)
        await db.auth_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.license_keys.create_index("key_hash", unique=True)
        await db.license_keys.create_index("id", unique=True)
        await db.license_keys.create_index([("redeemed_at", 1), ("revoked_at", 1)])
        await db.watch_activity.create_index("user_id", unique=True)
        await db.media_catalog_history.create_index("history_key", unique=True)
        await db.media_catalog_history.create_index([("tmdb_id", 1), ("active", 1)])
        await db.media_events.create_index("created_at", expireAfterSeconds=60 * 60 * 24 * 180)
        await db.admin_discovery_dismissals.create_index("imdb_id", unique=True)
        # MongoDB supprime automatiquement les demandes 24 h après leur
        # approbation. Les documents non approuvés n'ont pas ce champ.
        await db.wishboard.create_index("approved_expires_at", expireAfterSeconds=0)
    except Exception as e:
        logger.warning(f"Index unique users non créé (doublons existants ?) : {e}")
    try:
        await _seed_license_keys()
    except Exception as e:
        logger.error(f"Import sécurisé des clés SellAuth échoué : {e}")
    try:
        # Compatibilité avec les approbations créées avant cette fonctionnalité :
        # elles restent visibles 24 h à compter de ce déploiement.
        now = datetime.now(timezone.utc)
        await db.wishboard.update_many(
            {"status": "approved", "approved_expires_at": {"$exists": False}},
            {"$set": {"approved_at": now, "approved_expires_at": now + timedelta(hours=24)}},
        )
    except Exception as e:
        logger.warning(f"Migration expiration Wishboard échouée : {e}")
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
