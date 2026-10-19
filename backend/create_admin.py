"""Bootstrap admin pertama untuk project Supabase baru.

Pendaftaran mandiri sudah dihapus, jadi akun admin pertama harus dibuat dari
server (memakai service role key di backend/.env). Jalankan dari folder backend:

    python create_admin.py admin@contoh.id "password-ku" --nama "Admin"
"""

import argparse
import asyncio
import sys

from pydantic import ValidationError

from app.schemas import CreateUserRequest
from app.supabase_db import SupabaseError, create_user


def main() -> int:
    parser = argparse.ArgumentParser(description="Buat akun admin pertama.")
    parser.add_argument("email", help="Email admin")
    parser.add_argument("password", help="Password minimal 6 karakter")
    parser.add_argument("--nama", default="", help="Nama tampilan")
    args = parser.parse_args()

    try:
        request = CreateUserRequest(
            email=args.email,
            password=args.password,
            nama=args.nama,
            role="admin",
        )
    except ValidationError as exc:
        # Jangan cetak input_value — berisi password.
        pesan = "; ".join(
            f"{'.'.join(str(part) for part in err['loc'])}: {err['msg']}"
            for err in exc.errors()
        )
        print(f"Input tidak valid: {pesan}")
        return 1

    try:
        account = asyncio.run(create_user(request))
    except SupabaseError as exc:
        print(f"Gagal membuat admin: {exc}")
        return 1

    print(f"Admin dibuat: {account['email']} ({account['id']})")
    print("Akun langsung aktif tanpa verifikasi email. Silakan login.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
