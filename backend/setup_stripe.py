"""Setup Stripe catalog (idempotent)."""
import os
import stripe
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

CATALOG = [
    {
        "emergent_product_id": "ym_basic",
        "name": "YourMovie's Basic",
        "tax_code": "txcd_10103001",
        "prices": [
            {"lookup_key": "ym_basic_monthly", "amount": 499, "currency": "usd", "interval": "month"},
            {"lookup_key": "ym_basic_yearly", "amount": 4788, "currency": "usd", "interval": "year"},
        ],
    },
    {
        "emergent_product_id": "ym_standard",
        "name": "YourMovie's Standard",
        "tax_code": "txcd_10103001",
        "prices": [
            {"lookup_key": "ym_standard_monthly", "amount": 999, "currency": "usd", "interval": "month"},
            {"lookup_key": "ym_standard_yearly", "amount": 9588, "currency": "usd", "interval": "year"},
        ],
    },
    {
        "emergent_product_id": "ym_premium",
        "name": "YourMovie's Premium",
        "tax_code": "txcd_10103001",
        "prices": [
            {"lookup_key": "ym_premium_monthly", "amount": 1699, "currency": "usd", "interval": "month"},
            {"lookup_key": "ym_premium_yearly", "amount": 16308, "currency": "usd", "interval": "year"},
        ],
    },
]


def get_or_create_product(entry):
    for p in stripe.Product.list(active=True).auto_paging_iter():
        md = p.to_dict().get("metadata", {})
        if md.get("emergent_product_id") == entry["emergent_product_id"]:
            return p
    return stripe.Product.create(
        name=entry["name"],
        tax_code=entry.get("tax_code"),
        metadata={"managed_by": "emergent", "emergent_product_id": entry["emergent_product_id"]},
    )


def ensure_price(product, p):
    existing = stripe.Price.list(lookup_keys=[p["lookup_key"]], active=True, limit=1).data
    if existing and (existing[0].unit_amount != p["amount"] or existing[0].currency != p["currency"]):
        stripe.Price.modify(existing[0].id, active=False)
        existing = []
    if not existing:
        kwargs = dict(
            product=product.id,
            unit_amount=p["amount"],
            currency=p["currency"],
            lookup_key=p["lookup_key"],
            transfer_lookup_key=True,
        )
        if p.get("interval"):
            kwargs["recurring"] = {"interval": p["interval"]}
        stripe.Price.create(**kwargs)
        print(f"Created price {p['lookup_key']} = {p['amount']}c/{p.get('interval','once')}")
    else:
        print(f"Price {p['lookup_key']} already exists")


def main():
    for entry in CATALOG:
        product = get_or_create_product(entry)
        print(f"Product: {product.name}")
        for p in entry["prices"]:
            ensure_price(product, p)
    print("Done.")


if __name__ == "__main__":
    main()
