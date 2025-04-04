
// Forçando mudança para commit
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;

// CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

// Middleware de log
const requestLogs = [];
const MAX_LOGS = 1000;

app.use((req, res, next) => {
    const log = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers['user-agent']
    };

    res.on('finish', () => {
        log.status = res.statusCode;
        requestLogs.unshift(log);
        if (requestLogs.length > MAX_LOGS) requestLogs.pop();
    });

    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Configuração do multer
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
            const filename = `${prefix}${counter}${ext}`;
            cb(null, filename);
        });
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

// Endpoint de upload
app.post('/upload', upload.single('arquivo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    }

    res.json({ mensagem: 'Arquivo enviado com sucesso.', arquivo: req.file.filename });
});

// Endpoint para ver os logs
app.get('/logs', (req, res) => {
    res.json(requestLogs);
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
