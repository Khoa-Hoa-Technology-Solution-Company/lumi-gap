FROM debian:bookworm-slim AS sandbox-build
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev linux-libc-dev libseccomp-dev && rm -rf /var/lib/apt/lists/*
COPY apps/backend/compiler/sandbox.c /sandbox.c
RUN gcc -O2 -Wall -Wextra -Werror /sandbox.c -lseccomp -o /sandbox

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 libseccomp2 texlive-latex-base texlive-latex-recommended texlive-latex-extra texlive-publishers texlive-science texlive-fonts-recommended texlive-xetex texlive-lang-other lmodern cm-super fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY --from=sandbox-build /sandbox /usr/local/bin/tex-sandbox
COPY apps/backend/compiler/server.py /app/server.py
USER 65534:65534
WORKDIR /tmp
EXPOSE 8020
ENTRYPOINT ["python3", "-B", "/app/server.py"]
