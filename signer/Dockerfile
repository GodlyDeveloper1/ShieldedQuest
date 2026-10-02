FROM rust:1 AS build
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:stable-slim
COPY --from=build /app/target/release/signer /usr/local/bin/signer
EXPOSE 8081
CMD ["signer"]
