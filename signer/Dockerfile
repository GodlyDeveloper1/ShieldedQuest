# The Shielded Quest signer, built from source. TESTNET ONLY.
#
# The first build takes 20-40 minutes: it compiles the Zcash proving code in
# release mode. Later builds reuse the cache and take seconds unless the code changed.

FROM rust:1-trixie AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked && cp target/release/signer /signer

FROM debian:trixie-slim
# An unprivileged user, and a data folder it owns. The wallet seed, the wallet
# database and the pot records live in /data: mount a volume there and back it up.
RUN useradd --system --uid 10001 --home-dir /data --shell /usr/sbin/nologin signer \
 && mkdir -p /data && chown signer:signer /data
COPY --from=build /signer /usr/local/bin/signer
USER signer
WORKDIR /data
ENV SIGNER_DATA_DIR=/data
VOLUME /data
EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/signer"]
