ARG DEBIAN_RELEASE=bookworm
FROM debian:${DEBIAN_RELEASE}-slim AS sandbox-build
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev linux-libc-dev libseccomp-dev && rm -rf /var/lib/apt/lists/*
COPY apps/backend/compiler/sandbox.c /sandbox.c
RUN gcc -O2 -Wall -Wextra -Werror /sandbox.c -lseccomp -o /sandbox

FROM debian:${DEBIAN_RELEASE}-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 libseccomp2 texlive-latex-base texlive-latex-recommended texlive-latex-extra texlive-publishers texlive-science texlive-fonts-recommended texlive-xetex texlive-luatex texlive-bibtex-extra biber texlive-lang-other lmodern cm-super fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-extra && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends librsvg2-bin ghostscript && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends unicode-data texlive-plain-generic && rm -rf /var/lib/apt/lists/*
COPY --from=sandbox-build /sandbox /usr/local/bin/tex-sandbox
COPY apps/backend/compiler/server.py /app/server.py
USER 65534:65534
WORKDIR /tmp
EXPOSE 8020
ENTRYPOINT ["python3", "-B", "/app/server.py"]
