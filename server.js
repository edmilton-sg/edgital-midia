const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');

// Configuração de CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

// Middleware para logging de requisições
const requestLogs = [];
const MAX_LOGS = 1000;

app.use((req, res, next) => {
    const log = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        status: res.statusCode
    };
    requestLogs.unshift(log);
    if (requestLogs.length > MAX_LOGS) requestLogs.pop();
    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const mediaDir = path.join(__dirname, 'midia');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }
        cb(null, mediaDir);
    },
    filename: function (req, file, cb) {
        const prefix = 'midia-';
        const mediaDir = path.join(__dirname, 'midia');
        let counter = 1;

        fs.readdir(mediaDir, (err, files) => {
            if (err) {
                console.error('Erro ao ler diretório:', err);
                return cb(err);
            }

            files.forEach(file => {
                const match = file.match(new RegExp(`${prefix}(\\d+)\\..*`));
                if (match) {
                    const num = parseInt(match[1]);
                    if (num >= counter) counter = num + 1;
                }
            });

            const ext = path.extname(file.originalname);
            const newFilename = `${prefix}${counter.toString().padStart(2, '0')}${ext}`;
            cb(null, newFilename);
        });
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido'));
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

// Aqui começa a parte corrigida do HTTPS
const certPath = '/etc/letsencrypt/live/buscamax.com.br';
const useHttps = fs.existsSync(`${certPath}/privkey.pem`) && fs.existsSync(`${certPath}/fullchain.pem`);

const PORT = useHttps ? 443 : 3000;

if (useHttps) {
    const options = {
        key: fs.readFileSync(`${certPath}/privkey.pem`),
        cert: fs.readFileSync(`${certPath}/fullchain.pem`)
    };

    https.createServer(options, app).listen(PORT, () => {
        console.log(`Servidor HTTPS rodando na porta ${PORT}`);
    });
} else {
    http.createServer(app).listen(PORT, () => {
        console.log(`Servidor HTTP rodando na porta ${PORT}`);
    });
}
