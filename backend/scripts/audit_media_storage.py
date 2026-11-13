import hashlib
import json
import os
import sys
from pathlib import Path
from dotenv import dotenv_values
import psycopg2

backend_dir = Path(r"e:\E\Adarsh Pro Panel\backend")
media_dir = backend_dir / "media"

print("=" * 80)
print("PRO-PANEL MEDIA STORAGE AUDIT")
print("=" * 80)
print(f"Media Root: {media_dir}")

total_files = 0
total_size = 0
extension_counts = {}
file_manifest = []

if media_dir.exists():
    for f in sorted(media_dir.rglob("*")):
        if f.is_file():
            total_files += 1
            sz = f.stat().st_size
            total_size += sz
            ext = f.suffix.lower() or "no_extension"
            extension_counts[ext] = extension_counts.get(ext, 0) + 1
            
            # Compute SHA-256
            hasher = hashlib.sha256()
            with open(f, "rb") as fh:
                while chunk := fh.read(65536):
                    hasher.update(chunk)
            sha256_hash = hasher.hexdigest()
            rel_path = f.relative_to(media_dir).as_posix()
            file_manifest.append({
                "path": rel_path,
                "size": sz,
                "sha256": sha256_hash,
                "extension": ext
            })

print(f"Total Physical Media Files : {total_files}")
print(f"Total Media Storage Size   : {total_size:,} bytes ({total_size / (1024*1024):.2f} MB)")
print("File Type Breakdown:")
for ext, count in sorted(extension_counts.items(), key=lambda x: -x[1]):
    print(f"  {ext:<15}: {count:>6} files")

# Write media manifest file
manifest_path = backend_dir / "media_manifest.json"
with open(manifest_path, "w", encoding="utf-8") as mf:
    json.dump({
        "total_files": total_files,
        "total_size": total_size,
        "extension_counts": extension_counts,
        "files": file_manifest
    }, mf, indent=2)

sha256_txt_path = backend_dir / "media_manifest.sha256"
with open(sha256_txt_path, "w", encoding="utf-8") as sf:
    for item in file_manifest:
        sf.write(f"{item['sha256']}  media/{item['path']}\n")

print(f"Saved Manifest : {manifest_path}")
print(f"Saved Checksums: {sha256_txt_path}")

# Connect to local cardflow_db to inspect media references in the database
env_vals = dotenv_values(backend_dir / ".env")
db_host = env_vals.get("POSTGRES_HOST") or env_vals.get("DB_HOST", "localhost")
db_port = env_vals.get("POSTGRES_PORT") or env_vals.get("DB_PORT", "5432")
db_user = env_vals.get("POSTGRES_USER") or env_vals.get("DB_USER", "postgres")
db_password = env_vals.get("POSTGRES_PASSWORD") or env_vals.get("DB_PASSWORD", "")
db_name = env_vals.get("POSTGRES_DB") or env_vals.get("DB_NAME", "cardflow_db")

try:
    conn = psycopg2.connect(
        host=db_host,
        port=db_port,
        user=db_user,
        password=db_password,
        dbname=db_name,
    )
    with conn.cursor() as cur:
        # Check CardMedia
        cur.execute("SELECT COUNT(*) FROM mediafiles_cardmedia")
        cm_count = cur.fetchone()[0]
        cur.execute("SELECT file, original_filename FROM mediafiles_cardmedia LIMIT 10")
        cm_samples = cur.fetchall()

        # Check IDCard photo
        cur.execute("SELECT COUNT(*) FROM tables_idcard WHERE photo IS NOT NULL AND photo != ''")
        idcard_photo_count = cur.fetchone()[0]

        # Check IDCard field_data photos
        cur.execute("SELECT field_data FROM tables_idcard")
        rows = cur.fetchall()
        field_data_photo_refs = []
        for (fd,) in rows:
            if isinstance(fd, dict):
                for k, v in fd.items():
                    if isinstance(v, str) and ("adarshimg/" in v or "id_card_images/" in v or v.lower().endswith((".jpg", ".png", ".jpeg"))):
                        field_data_photo_refs.append(v)

    conn.close()
    print("-" * 80)
    print("Database References:")
    print(f"  mediafiles_cardmedia records : {cm_count}")
    print(f"  tables_idcard.photo non-null : {idcard_photo_count}")
    print(f"  field_data image references  : {len(field_data_photo_refs)}")
except Exception as e:
    print(f"Database media inspection note: {e}")

print("=" * 80)

