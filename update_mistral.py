import argparse
from pathlib import Path


def update_env_model(env_path: Path, model: str) -> None:
    existing = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    key = "MISTRAL_OCR_MODEL"
    out = []
    replaced = False

    for line in existing:
        if line.startswith(f"{key}="):
            out.append(f"{key}={model}")
            replaced = True
        else:
            out.append(line)

    if not replaced:
        out.append(f"{key}={model}")

    env_path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Set MISTRAL_OCR_MODEL in a .env file.")
    parser.add_argument("model", help="Model name to write (example: mistral-ocr-latest)")
    parser.add_argument("--env", default=".env", help="Path to .env file (default: .env)")
    args = parser.parse_args()

    env_path = Path(args.env)
    update_env_model(env_path, args.model.strip())
    print(f"Updated {env_path} with MISTRAL_OCR_MODEL={args.model.strip()}")


if __name__ == "__main__":
    main()
