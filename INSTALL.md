# 📦 Installation Guide

## Jika NPM Registry Error

Jika terjadi error `500 Internal Server Error` saat install dependencies:

### Solusi 1: Gunakan NPM Registry Alternatif

```bash
# Clear npm cache
npm cache clean --force

# Gunakan registry alternatif (yarn registry)
npm config set registry https://registry.yarnpkg.com

# Atau gunakan registry npmmirror (China mirror, biasanya lebih stabil)
npm config set registry https://registry.npmmirror.com

# Install dependencies
npm install
```

### Solusi 2: Install Manual Satu-per-Satu

```bash
npm install node-telegram-bot-api --force
npm install fluent-ffmpeg --force
npm install ffmpeg-static --force
npm install ffprobe-static --force
npm install axios --force
npm install dotenv --force
```

### Solusi 3: Gunakan Yarn

```bash
# Install yarn jika belum ada
npm install -g yarn

# Install dependencies dengan yarn
yarn install
```

### Solusi 4: Kembali ke Registry Default

Jika sudah berhasil install, kembalikan ke registry default:

```bash
npm config set registry https://registry.npmjs.org
```

## Verifikasi Instalasi

Setelah instalasi berhasil, cek apakah semua dependencies terinstall:

```bash
npm list --depth=0
```

Output yang diharapkan:
```
├── axios@1.7.2
├── dotenv@16.4.5
├── ffmpeg-static@5.2.0
├── ffprobe-static@3.1.0
├── fluent-ffmpeg@2.1.3
└── node-telegram-bot-api@0.66.0
```

## Jalankan Bot

```bash
npm start
```

atau

```bash
node main.js
```
