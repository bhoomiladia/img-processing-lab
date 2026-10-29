"""Usage: uv run python -m app.cli create-staff --email you@school.in --name "Your Name" --role admin"""

import argparse
import getpass

import psycopg

from .auth import hash_password
from .config import settings
from .db import SCHEMA


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    cs = sub.add_parser("create-staff")
    cs.add_argument("--email", required=True)
    cs.add_argument("--name", required=True)
    cs.add_argument("--role", choices=["admin", "teacher"], default="admin")
    args = parser.parse_args()

    password = getpass.getpass("Password (min 8 chars): ")
    if len(password) < 8 or password != getpass.getpass("Repeat password: "):
        raise SystemExit("Passwords must match and be at least 8 characters")
    with psycopg.connect(settings.database_url, autocommit=True) as conn:
        conn.execute(SCHEMA.read_text())
        conn.execute(
            "INSERT INTO staff (email, name, role, password_hash) VALUES (%s, %s, %s, %s)"
            " ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role,"
            " password_hash = EXCLUDED.password_hash",
            (args.email.strip().lower(), args.name, args.role, hash_password(password)),
        )
    print(f"Staff account ready: {args.email} ({args.role})")


if __name__ == "__main__":
    main()
