import express from 'express';
import { all, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Listar custos gerais (despesas que não estão ligadas a um serviço específico)
router.get('/', verifyToken, async (req, res) => {
  try {
    const despesas = await all("SELECT * FROM custos WHERE trabalho_id IS NULL AND tipo = 'Geral' ORDER BY data DESC");
    res.json(despesas);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar despesas' });
  }
});

// Criar novo custo geral do laboratório
router.post('/', verifyToken, async (req, res) => {
  try {
    const { descricao, valor, data } = req.body;
    const result = await query(
      "INSERT INTO custos (trabalho_id, descricao, tipo, valor, data) VALUES (NULL, ?, 'Geral', ?, ?)",
      [descricao, valor, data]
    );
    res.json({ id: result.lastID, message: 'Custo registrado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar custo' });
  }
});

// Excluir custo
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM custos WHERE id = ?', [id]);
    res.json({ message: 'Custo excluído' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir custo' });
  }
});

export default router;
