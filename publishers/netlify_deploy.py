"""Deploy output folder to Netlify."""
import hashlib
import os
import requests
from utils.logger import get_logger

log = get_logger()


def _resolve_site_id(site_name_or_id: str, token: str) -> str:
    try:
        resp = requests.get(
            "https://api.netlify.com/api/v1/sites",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        if resp.status_code == 200:
            for site in resp.json():
                if site.get("name") == site_name_or_id or site.get("id") == site_name_or_id:
                    return site["id"]
    except Exception:
        pass
    return site_name_or_id


def _redirect_html(today_slug: str) -> bytes:
    return f"""<!DOCTYPE html>
<html>
<head>
<meta http-equiv="refresh" content="0; url=/{today_slug}/">
<title>Notícias IA</title>
</head>
<body><script>window.location.replace("/{today_slug}/");</script></body>
</html>""".encode("utf-8")


def deploy(output_base_dir: str, today_slug: str, token: str, site_id: str) -> str:
    resolved_id = _resolve_site_id(site_id, token)

    files: dict[str, bytes] = {}
    for entry in os.scandir(output_base_dir):
        if entry.is_dir():
            page_path = os.path.join(entry.path, "index.html")
            if os.path.exists(page_path):
                with open(page_path, "rb") as f:
                    files[f"/{entry.name}/index.html"] = f.read()

    files["/index.html"] = _redirect_html(today_slug)

    if not files:
        raise RuntimeError("Nenhuma página encontrada em output/")

    hashes = {p: hashlib.sha1(c).hexdigest() for p, c in files.items()}

    resp = requests.post(
        f"https://api.netlify.com/api/v1/sites/{resolved_id}/deploys",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"files": hashes},
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Netlify erro {resp.status_code}: {resp.text}")

    deploy_data = resp.json()
    deploy_id = deploy_data["id"]
    required = set(deploy_data.get("required", []))

    for path, content in files.items():
        if hashes[path] not in required:
            continue
        up = requests.put(
            f"https://api.netlify.com/api/v1/deploys/{deploy_id}/files/{path.lstrip('/')}",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/octet-stream",
            },
            data=content,
            timeout=30,
        )
        if up.status_code not in (200, 201):
            raise RuntimeError(f"Upload erro {up.status_code} para {path}: {up.text}")

    url = f"https://{site_id}.netlify.app/{today_slug}/"
    log.info(f"Deploy concluído: {url}")
    return url
