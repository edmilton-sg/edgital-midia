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
const MAX_LOGS = 1000; // Mantém os últimos 1000 logs

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
    if (requestLogs.length > MAX_LOGS) {
        requestLogs.pop();
    }
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
        // Gera um nome único para o arquivo
        const prefix = 'midia-';
        const mediaDir = path.join(__dirname, 'midia');
        let counter = 1;
        
        // Lista todos os arquivos na pasta midia
        fs.readdir(mediaDir, (err, files) => {
            if (err) {
                console.error('Erro ao ler diretório:', err);
                return cb(err);
            }

            // Encontra o maior número existente
            files.forEach(file => {
                const match = file.match(new RegExp(`${prefix}(\\d+)\\..*`));
                if (match) {
                    const num = parseInt(match[1]);
                    if (num >= counter) counter = num + 1;
                }
            });

            // Gera o novo nome do arquivo
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
        fileSize: 50 * 1024 * 1024 // Limite de 50MB
    }
});

// Configuração do Pool para o Neon Database
const pool = new Pool({
    host: 'ep-proud-resonance-a5l33umv-pooler.us-east-2.aws.neon.tech',
    database: 'neondb',
    user: 'neondb_owner',
    password: 'npg_0QZFGx6XPJlv',
    port: 5432,
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
        
        // Query SQL otimizada
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
        
        console.log('Executando query:', query);
        
        const result = await pool.query(query, [barra]);
        
        console.log('Resultado da query:', result.rows);
        
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
    const mediaDir = path.join(__dirname, 'midia');
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

// Nova rota para listar arquivos de mídia da pasta 'midiacarnes'
app.get('/api/listar_arquivos_carnes', (req, res) => {
    const mediaDir = path.join(__dirname, 'midiacarnes'); // Aponta para 'midiacarnes'
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
    const filePath = path.join(__dirname, 'midia', filename);
    
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

// Tratamento de erros
httpsServer.on('error', (error) => {
    console.error('Erro no servidor HTTPS:', error);
});

// Gerenciamento de encerramento
process.on('SIGTERM', () => {
    console.log('Sinal SIGTERM recebido. Encerrando servidor...');
    httpsServer.close(() => {
        console.log('Servidor HTTPS encerrado');
    });
});

process.on('SIGINT', () => {
    console.log('Sinal SIGINT recebido. Encerrando servidor...');
    httpsServer.close(() => {
        console.log('Servidor HTTPS encerrado');
    });
});

module.exports = app;


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

        // Retorna os produtos em formato JSON
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