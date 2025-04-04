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
    ssl: {
        require: true,
        rejectUnauthorized: false
    }
});

// Test the database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Erro detalhado na conexão com o banco:', {
            code: err.code,
            message: err.message,
            stack: err.stack
        });
    } else {
        console.log('Successfully connected to the database');
        release();
    }
});

// Rota de status da API
app.get('/api/status', (req, res) => {
    pool.query('SELECT 1')
        .then(() => {
            res.json({
                status: 'online',
                database: 'connected',
                timestamp: new Date().toISOString()
            });
        })
        .catch(err => {
            res.status(500).json({
                status: 'error',
                database: 'disconnected',
                error: err.message,
                timestamp: new Date().toISOString()
            });
        });
});

// Rota para consulta de produtos
app.get('/api/produtos/:barra', async (req, res) => {
    try {
        const { barra } = req.params;
        
        console.log('Consultando produto:', barra);
        
        const query = `
            SELECT 
                p.descricao,
                p.venda,
                CASE 
                    WHEN p.vlatacado > 0 THEN p.vlatacado 
                    ELSE NULL 
                END as vlatacado,
                CASE 
                    WHEN p.fator > 0 THEN p.fator 
                    ELSE NULL 
                END as fator
            FROM produtos p
            WHERE p.barra = $1
        `;
        
        const result = await pool.query(query, [barra]);
        
        if (result.rows.length > 0) {
            const produto = result.rows[0];
            res.json({
                descricao: produto.descricao,
                venda: produto.venda,
                vlatacado: produto.vlatacado,
                fator: produto.fator
            });
        } else {
            res.status(404).json({ error: 'Produto não encontrado' });
        }
    } catch (err) {
        console.error('Erro detalhado na consulta:', {
            code: err.code,
            message: err.message,
            stack: err.stack
        });
        res.status(500).json({ 
            error: 'Erro ao consultar produto', 
            details: err.message,
            code: err.code
        });
    }
});

// Rota para listar arquivos de mídia
app.get('/api/listar_arquivos', (req, res) => {
    const mediaDir = path.join(__dirname, APP_CONFIG.uploadDir);
    try {
        if (!fs.existsSync(mediaDir)) {
            return res.json({ files: [] });
        }
        const files = fs.readdirSync(mediaDir);
        const mediaFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.webm'].includes(ext);
        });
        res.json({ files: mediaFiles });
    } catch (error) {
        console.error('Error reading media directory:', error);
        res.status(500).json({ error: 'Erro ao listar arquivos' });
    }
});

// Rota para listar arquivos de carnes
app.get('/api/listar_arquivos_carnes', (req, res) => {
    const mediaDir = path.join(__dirname, APP_CONFIG.uploadDirCarnes);
    try {
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
            return res.json({ files: [] });
        }
        const files = fs.readdirSync(mediaDir);
        const mediaFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.webm'].includes(ext);
        });
        res.json({ files: mediaFiles });
    } catch (error) {
        console.error('Erro ao ler diretório de mídia:', error);
        res.status(500).json({ error: 'Erro ao listar arquivos' });
    }
});

// Rota para upload de arquivos
app.post('/api/upload_arquivo', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }
        res.json({ 
            success: true, 
            filename: req.file.filename,
            message: 'Arquivo enviado com sucesso'
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: 'Erro ao fazer upload do arquivo' });
    }
});

// Rota para deletar arquivo
app.delete('/api/deletar_arquivo/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(__dirname, APP_CONFIG.uploadDir, filename);
    
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Arquivo não encontrado' });
        }
        
        fs.unlinkSync(filePath);
        res.json({ success: true, message: 'Arquivo deletado com sucesso' });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: 'Erro ao deletar arquivo' });
    }
});

// Rota para visualizar logs de requisições
app.get('/api/monitor', (req, res) => {
    res.json({
        totalRequests: requestLogs.length,
        requests: requestLogs,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// Rota para limpar logs
app.post('/api/monitor/clear', (req, res) => {
    requestLogs.length = 0;
    res.json({ message: 'Logs limpos com sucesso' });
});

// Rota para obter todos os produtos da tabela 'carnes'
app.get('/api/carnes/todos', async (req, res) => {
    try {
        const query = `
            SELECT 
                codigo,
                descricao,
                venda,
                corte
            FROM carnes
        `;

        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar todos os produtos:', {
            code: err.code,
            message: err.message,
            stack: err.stack
        });
        res.status(500).json({ 
            error: 'Erro ao buscar produtos', 
            details: err.message,
            code: err.code
        });
    }
});

// Configuração dos diretórios estáticos
app.use('/midia', express.static(path.join(__dirname, APP_CONFIG.uploadDir)));
app.use('/midiacarnes', express.static(path.join(__dirname, APP_CONFIG.uploadDirCarnes)));

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
