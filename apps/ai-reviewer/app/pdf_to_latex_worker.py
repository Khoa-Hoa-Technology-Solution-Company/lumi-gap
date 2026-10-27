"""Bounded parser process: timeout/memory failure cannot strand the API worker."""
import json
import os
import sys


def main():
    try:
        os.environ["OPENBLAS_NUM_THREADS"] = "1"
        os.environ["OMP_NUM_THREADS"] = "1"
        # resource is POSIX-only. Windows still uses the parent process's
        # timeout, input/output size bounds and single-conversion semaphore.
        if os.name == "posix":
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (1_500_000_000, 1_500_000_000))
            resource.setrlimit(resource.RLIMIT_CPU, (240, 240))
            resource.setrlimit(resource.RLIMIT_FSIZE, (25_000_000, 25_000_000))
        sys.stdout.reconfigure(encoding="utf-8")
        if sys.argv[1] == "compare":
            import base64
            from app.pdf_comparison import compare_pdfs
            raw = sys.stdin.buffer.read(33_334_000)
            if len(raw) >= 33_334_000:
                raise ValueError("PDF comparison exceeds server limits")
            payload = json.loads(raw)
            result = compare_pdfs(base64.b64decode(payload["original"], validate=True),
                                  base64.b64decode(payload["generated"], validate=True))
        else:
            from app.pdf_to_latex import convert_pdf, MAX_BYTES
            result = convert_pdf(sys.stdin.buffer.read(MAX_BYTES + 1), sys.argv[1])
        print(json.dumps(result, ensure_ascii=False))
    except ValueError as exc:
        print(json.dumps({"error": str(exc)[:300]}))
    except Exception:
        print(json.dumps({"error": "PDF could not be converted within server limits"}))


if __name__ == "__main__":
    main()
