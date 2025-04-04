const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

// Configurações da aplicação
const APP_CONFIG = {
    name: process.env.APP_NAME || 'Totem Digital',
    version: process.env.APP_VERSION || '1.0.0',
    domain: process.env.APP_DOMAIN || 'http://localhost:3000',
    uploadDir: process.env.UPLOAD_DIR || 'midia',
    uploadDirCarnes: 'midiacarnes', // Novo diretório para arquivos de carnes
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800 // 50MB
};

// Configurações de segurança
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            mediaSrc: ["'self'", "data:", "blob:"],
        },
    },
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100 // limite de 100 requisições por IP
});
app.use(limiter);

// Configuração de CORS
app.use(cors({
    origin: process.env.CORS_ENABLED === 'true' 
        ? [APP_CONFIG.domain]
        : '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compressão
app.use(compression());

// Logging
app.use(morgan('combined'));

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
        const mediaDir = path.join(__dirname, APP_CONFIG.uploadDir);
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }
        cb(null, mediaDir);
    },
    filename: function (req, file, cb) {
        const prefix = 'midia-';
        const mediaDir = path.join(__dirname, APP_CONFIG.uploadDir);
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
        fileSize: APP_CONFIG.maxFileSize
    }
});

// Configuração do banco de dados
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Rota de health check para o Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        app: APP_CONFIG.name,
        version: APP_CONFIG.version,
        domain: APP_CONFIG.domain
    });
});

// Rota para informações da aplicação
app.get('/api/info', (req, res) => {
    res.json({
        name: APP_CONFIG.name,
        version: APP_CONFIG.version,
        domain: APP_CONFIG.domain,
        environment: process.env.NODE_ENV
    });
});

// Rota para listar arquivos de carnes
app.get('/api/listar_arquivos_carnes', (req, res) => {
    const mediaDirCarnes = path.join(__dirname, APP_CONFIG.uploadDirCarnes);
    
    // Cria o diretório se não existir
    if (!fs.existsSync(mediaDirCarnes)) {
        fs.mkdirSync(mediaDirCarnes, { recursive: true });
    }

    fs.readdir(mediaDirCarnes, (err, files) => {
        if (err) {
            console.error('Erro ao ler diretório de carnes:', err);
            return res.status(500).json({ error: 'Erro ao listar arquivos de carnes' });
        }

        // Filtra apenas arquivos de imagem e vídeo
        const mediaFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.webm'].includes(ext);
        });

        res.json({ files: mediaFiles });
    });
});

// Rota para upload de arquivos de carnes
app.post('/api/upload_arquivo_carnes', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // Move o arquivo para o diretório de carnes
    const oldPath = req.file.path;
    const newPath = path.join(__dirname, APP_CONFIG.uploadDirCarnes, req.file.filename);

    fs.rename(oldPath, newPath, (err) => {
        if (err) {
            console.error('Erro ao mover arquivo:', err);
            return res.status(500).json({ error: 'Erro ao salvar arquivo' });
        }
        res.json({ message: 'Arquivo enviado com sucesso', filename: req.file.filename });
    });
});

// Rota para servir arquivos estáticos do diretório midiacarnes
app.use('/midiacarnes', express.static(path.join(__dirname, APP_CONFIG.uploadDirCarnes)));

// Suas rotas e lógica continuam normalmente abaixo...

// Tratamento de erros
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`${APP_CONFIG.name} v${APP_CONFIG.version}`);
    console.log(`Servidor rodando em ${APP_CONFIG.domain}`);
    console.log(`Modo: ${process.env.NODE_ENV || 'development'}`);
});
