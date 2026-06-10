import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;

export const initDatabase = async () => {
  try {
    const dbPath = path.join(__dirname, 'labprotese.db');
    console.log('Caminho do banco de dados:', dbPath);
    
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Tabela de usuários (administradores do laboratório)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de tipos de prótese
    await db.exec(`
      CREATE TABLE IF NOT EXISTS tipos_protese (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE,
        descricao TEXT,
        valor_padrao REAL,
        tempo_medio_dias INTEGER DEFAULT 7,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de serviços padrão
    await db.exec(`
      CREATE TABLE IF NOT EXISTS servicos_padrao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE,
        tipo_protese_id INTEGER,
        descricao TEXT,
        valor_padrao REAL NOT NULL,
        tempo_medio_dias INTEGER DEFAULT 7,
        ativo BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tipo_protese_id) REFERENCES tipos_protese(id)
      )
    `);

    // Tabela de dentistas (responsáveis pelos trabalhos)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS dentistas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        telefone TEXT,
        email TEXT,
        cpf TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de pacientes
    await db.exec(`
      CREATE TABLE IF NOT EXISTS pacientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        telefone TEXT,
        email TEXT,
        cpf TEXT UNIQUE,
        data_nascimento TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de trabalhos/serviços
    await db.exec(`
      CREATE TABLE IF NOT EXISTS trabalhos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paciente_id INTEGER NOT NULL,
        dentista_id INTEGER NOT NULL,
        tipo_protese_id INTEGER,
        descricao TEXT NOT NULL,
        procedimento TEXT NOT NULL,
        data_entrada TEXT NOT NULL,
        data_saida TEXT,
        prazo_entrega TEXT,
        prioridade TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'Pendente',
        valor_bruto REAL NOT NULL,
        custo_operacional REAL DEFAULT 0,
        lucro_liquido REAL DEFAULT 0,
        forma_pagamento TEXT,
        resumo_trabalho TEXT,
        observacoes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
        FOREIGN KEY (dentista_id) REFERENCES dentistas(id),
        FOREIGN KEY (tipo_protese_id) REFERENCES tipos_protese(id)
      )
    `);

    // Tabela de etapas do procedimento
    await db.exec(`
      CREATE TABLE IF NOT EXISTS etapas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trabalho_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        descricao TEXT,
        status TEXT DEFAULT 'Pendente',
        data_inicio TEXT,
        data_conclusao TEXT,
        ordem INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (trabalho_id) REFERENCES trabalhos(id)
      )
    `);

    // Tabela de custos operacionais
    await db.exec(`
      CREATE TABLE IF NOT EXISTS custos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trabalho_id INTEGER NOT NULL,
        descricao TEXT NOT NULL,
        tipo TEXT NOT NULL,
        valor REAL NOT NULL,
        data TEXT NOT NULL,
        observacoes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (trabalho_id) REFERENCES trabalhos(id)
      )
    `);

    // Tabela de anexos (fotos, radiografias, etc)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS anexos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trabalho_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        url TEXT NOT NULL,
        descricao TEXT,
        data_upload DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (trabalho_id) REFERENCES trabalhos(id)
      )
    `);

    // Migrações de segurança
    try { await db.exec("ALTER TABLE trabalhos ADD COLUMN tipo_protese_id INTEGER"); } catch (e) {}
    try { await db.exec("ALTER TABLE trabalhos ADD COLUMN prazo_entrega TEXT"); } catch (e) {}
    try { await db.exec("ALTER TABLE trabalhos ADD COLUMN prioridade TEXT DEFAULT 'normal'"); } catch (e) {}
    try { await db.exec("ALTER TABLE trabalhos ADD COLUMN forma_pagamento TEXT"); } catch (e) {}
    try { await db.exec("ALTER TABLE trabalhos ADD COLUMN resumo_trabalho TEXT"); } catch (e) {}

    // Inserir usuário admin padrão se não existir
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASS || '123456';

    const existingUser = await db.get('SELECT * FROM users WHERE username = ?', adminUser);
    if (!existingUser) {
      await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', adminUser, adminPass, 'admin');
      console.log('Usuário admin padrão inserido.');
    }

    // Inserir tipos de prótese padrão
    const tiposProtese = [
      { nome: 'Coroa Unitária', tempo_medio_dias: 7, valor_padrao: 400 },
      { nome: 'Ponte', tempo_medio_dias: 10, valor_padrao: 900 },
      { nome: 'Prótese Total', tempo_medio_dias: 14, valor_padrao: 1500 },
      { nome: 'Prótese Parcial', tempo_medio_dias: 10, valor_padrao: 1200 },
      { nome: 'Implante', tempo_medio_dias: 21, valor_padrao: 800 },
      { nome: 'Faceta', tempo_medio_dias: 7, valor_padrao: 350 },
      { nome: 'Limpeza/Ajuste', tempo_medio_dias: 1, valor_padrao: 150 }
    ];

    for (const tipo of tiposProtese) {
      const existing = await db.get('SELECT * FROM tipos_protese WHERE nome = ?', tipo.nome);
      if (!existing) {
        await db.run(
          'INSERT INTO tipos_protese (nome, tempo_medio_dias, valor_padrao) VALUES (?, ?, ?)',
          [tipo.nome, tipo.tempo_medio_dias, tipo.valor_padrao]
        );
      }
    }

    console.log('Banco de dados SQLite inicializado com sucesso!');
  } catch (error) {
    console.error('Erro ao inicializar banco de dados SQLite:', error);
    throw error;
  }
};

export const query = async (sql, params = []) => {
  if (!db) throw new Error('Database not initialized.');
  return await db.run(sql, params);
};

export const get = async (sql, params = []) => {
  if (!db) throw new Error('Database not initialized.');
  return await db.get(sql, params);
};

export const all = async (sql, params = []) => {
  if (!db) throw new Error('Database not initialized.');
  return await db.all(sql, params);
};

export default db;
