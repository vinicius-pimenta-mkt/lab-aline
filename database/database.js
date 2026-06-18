import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;

export const initDatabase = async () => {
  try {
    const dbPath = process.env.DB_PATH || path.join(__dirname, 'labprotese.db');
    console.log('Caminho do banco de dados:', dbPath);
    
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    // ==========================================
    // NOVAS TABELAS: MOTOBOYS E ROTAS
    // ==========================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS motoboys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE,
        telefone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS motoboy_rotas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        motoboy_id INTEGER NOT NULL,
        data TEXT NOT NULL,
        de_onde TEXT NOT NULL,
        para_onde TEXT NOT NULL,
        valor REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (motoboy_id) REFERENCES motoboys(id)
      )
    `);
    // ==========================================

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

    const servicosFixos = [
      { nome: 'Vazamento Gesso Comum', valor: 15.00 },
      { nome: 'Vazamento Gesso Especial', valor: 25.00 },
      { nome: 'Montagem Asa', valor: 25.00 },
      { nome: 'Vazamento Gengiva Artificial', valor: 30.00 },
      { nome: 'Duplicação De Modelo', valor: 30.00 },
      { nome: 'Enceramento Diagnóstico', valor: 45.00 },
      { nome: 'Guia Cirúrgico A Vácuo', valor: 75.00 },
      { nome: 'Guia Cirúrgico Prensado', valor: 170.00 },
      { nome: 'Placa P/ Clareamento (Placa do dentista par)', valor: 60.00 },
      { nome: 'Placa P/ Clareamento (Placa Dentista 1 modelo)', valor: 35.00 },
      { nome: 'Placa clareamento par (com placa laboratório)', valor: 80.00 },
      { nome: 'Placa Miorrelaxante A Vácuo', valor: 120.00 },
      { nome: 'Placa Bruxismo Prensada/termo', valor: 205.00 },
      { nome: 'Protetor Bucal P/ Prática De Esportes', valor: 120.00 },
      { nome: 'Cerômero - Inlay/onlay', valor: 170.00 },
      { nome: 'Cerômero - Overlay', valor: 180.00 },
      { nome: 'Cerômero - Coroa Total', valor: 190.00 },
      { nome: 'Cerômero - Table Top', valor: 170.00 },
      { nome: 'Provisório - Unitário Sob-dente', valor: 75.00 },
      { nome: 'Provisório - Unitário Sob-Implante', valor: 85.00 },
      { nome: 'PPR - Imediata Em Acrílico', valor: 220.00 },
      { nome: 'PPR - Estrutura Metálica', valor: 305.00 },
      { nome: 'PPR - Montagem De Dentes', valor: 150.00 },
      { nome: 'PPR - Acrilização Comum', valor: 220.00 },
      { nome: 'PPR - Acrilização Caracterizada (stg)', valor: 280.00 },
      { nome: 'PPR - Conserto', valor: 150.00 },
      { nome: 'PTR - Moldeira Individual', valor: 80.00 },
      { nome: 'PTR - Plano De Orientação', valor: 90.00 },
      { nome: 'PTR - Montagem Dentes', valor: 150.00 },
      { nome: 'PTR - Prensagem Comum', valor: 220.00 },
      { nome: 'PTR - Prensagem Caracterizada (stg)', valor: 310.00 },
      { nome: 'PTR - Ptr Imediata', valor: 420.00 },
      { nome: 'PTR - Reembasamento', valor: 180.00 },
      { nome: 'PTR - Conserto', valor: 150.00 },
      { nome: 'Protocolo - Muralha Silicone', valor: 80.00 },
      { nome: 'Protocolo - Barra Protocolo (4/5 Implantes)', valor: 1250.00 },
      { nome: 'Protocolo - Solda (por ponto)', valor: 150.00 },
      { nome: 'Protocolo - Montagem Dentes', valor: 180.00 },
      { nome: 'Protocolo - Montagem Dentes na Barra', valor: 150.00 },
      { nome: 'Protocolo - Prensagem Comum', valor: 280.00 },
      { nome: 'Protocolo - Prensagem Caracterizada (stg)', valor: 320.00 }
    ];

    for (const svc of servicosFixos) {
      const existingSvc = await db.get('SELECT * FROM servicos_padrao WHERE nome = ?', svc.nome);
      if (!existingSvc) {
        await db.run(
          'INSERT INTO servicos_padrao (nome, valor_padrao, ativo) VALUES (?, ?, 1)',
          [svc.nome, svc.valor]
        );
      }
    }
    console.log('Serviços pré-fixados de prótese alinhados com sucesso!');

    // ==========================================
    // MIGRAÇÕES DE SEGURANÇA (CORRIGE O ERRO 500)
    // ==========================================
    try { await db.exec("ALTER TABLE trabalhos ADD COLUMN tipo_protese_id INTEGER"); } catch (e) {}
    try { await db.exec("ALTER TABLE trabalhos ADD COLUMN prazo_entrega TEXT"); } catch (e) {}
    try { await db.exec("ALTER TABLE trabalhos ADD COLUMN prioridade TEXT DEFAULT 'normal'"); } catch (e) {}
    try { await db.exec("ALTER TABLE trabalhos ADD COLUMN forma_pagamento TEXT"); } catch (e) {}
    try { await db.exec("ALTER TABLE trabalhos ADD COLUMN resumo_trabalho TEXT"); } catch (e) {}
    try { await db.exec("ALTER TABLE trabalhos ADD COLUMN data_saida TEXT"); } catch (e) {}
    try { await db.exec("ALTER TABLE custos ADD COLUMN nome TEXT"); } catch (e) {}
    
    // Novas colunas adicionadas à tabela dentistas
    try { await db.exec("ALTER TABLE dentistas ADD COLUMN cidade TEXT"); } catch (e) {}
    try { await db.exec("ALTER TABLE dentistas ADD COLUMN aniversario_dia INTEGER"); } catch (e) {}
    try { await db.exec("ALTER TABLE dentistas ADD COLUMN aniversario_mes INTEGER"); } catch (e) {}
    try {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS tsb_pacientes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          telefone TEXT,
          procedimento TEXT,
          recorrencia_meses INTEGER DEFAULT 4,
          data_inicio TEXT,
          ultimo_atendimento TEXT,
          proximo_atendimento TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (e) { console.error(e) }

    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASS || '123456';

    const existingUser = await db.get('SELECT * FROM users WHERE username = ?', adminUser);
    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(adminPass, 10);
      await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', adminUser, hashedPassword, 'admin');
      console.log('Usuário admin padrão inserido.');
    }

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
