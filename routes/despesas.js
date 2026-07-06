import express from 'express';
import { all, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// MÁGICA: Garante que a tabela de despesas_gerais exista no banco de dados automaticamente!
const criarTabelaSeNaoExistir = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS despesas_gerais (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        descricao TEXT NOT NULL,
        valor REAL NOT NULL,
        data TEXT NOT NULL,
        tipo TEXT DEFAULT 'Geral',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Tabela 'despesas_gerais' verificada/criada com sucesso.");
  } catch (err) {
    console.error("Erro ao criar tabela de despesas_gerais:", err);
  }
};

// Executa a verificação assim que o servidor inicia
criarTabelaSeNaoExistir();

// Listar custos gerais
router.get('/', verifyToken, async (req, res) => {
  try {
    const despesas = await all("SELECT * FROM despesas_gerais ORDER BY data DESC");
    res.json(despesas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar despesas' });
  }
});

// Criar novo custo geral do laboratório
router.post('/', verifyToken, async (req, res) => {
  try {
    const { descricao, valor, data } = req.body;
    const result = await query(
      "INSERT INTO despesas_gerais (descricao, valor, data) VALUES (?, ?, ?)",
      [descricao, valor, data]
    );
    res.json({ id: result.lastID, message: 'Custo registrado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao registrar custo' });
  }
});

// Excluir custo
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM despesas_gerais WHERE id = ?', [id]);
    res.json({ message: 'Custo excluído' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao excluir custo' });
  }
});

export default router;
