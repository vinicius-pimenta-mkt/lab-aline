import express from 'express';
import { all, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// 1. Listar Motoboys
router.get('/', verifyToken, async (req, res) => {
  try {
    const motoboys = await all('SELECT * FROM motoboys ORDER BY nome ASC');
    res.json(motoboys);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar motoboys' });
  }
});

// 2. Criar Motoboy
router.post('/', verifyToken, async (req, res) => {
  try {
    const { nome, telefone } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const result = await query('INSERT INTO motoboys (nome, telefone) VALUES (?, ?)', [nome, telefone || null]);
    res.status(201).json({ message: 'Motoboy criado', id: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar motoboy' });
  }
});

// 3. Listar Rotas
router.get('/rotas', verifyToken, async (req, res) => {
  try {
    const rotas = await all(`
      SELECT r.*, m.nome as motoboy_nome 
      FROM motoboy_rotas r 
      JOIN motoboys m ON r.motoboy_id = m.id 
      ORDER BY r.data DESC
    `);
    res.json(rotas);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar rotas' });
  }
});

// 4. Criar Rota (Corrida)
router.post('/rotas', verifyToken, async (req, res) => {
  try {
    const { motoboy_id, data, de_onde, para_onde, valor } = req.body;
    if (!motoboy_id || !data || !de_onde || !para_onde || valor === undefined) {
      return res.status(400).json({ error: 'Preencha todos os campos da rota' });
    }

    const result = await query(
      'INSERT INTO motoboy_rotas (motoboy_id, data, de_onde, para_onde, valor) VALUES (?, ?, ?, ?, ?)',
      [motoboy_id, data, de_onde, para_onde, valor]
    );
    res.status(201).json({ message: 'Rota criada', id: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar rota' });
  }
});

// Deletar Motoboy e as suas corridas
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    // 1. Limpa as rotas do motoboy
    await query('DELETE FROM motoboy_rotas WHERE motoboy_id = ?', [id]);
    // 2. Exclui o motoboy
    await query('DELETE FROM motoboys WHERE id = ?', [id]);
    
    res.json({ message: 'Motoboy e rotas excluídos com sucesso' });
  } catch (err) { 
    console.error("Erro ao deletar motoboy:", err);
    res.status(500).json({error: 'Erro ao excluir motoboy'}); 
  }
});

// 5. Atualizar Rota (Edição)
router.put('/rotas/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { motoboy_id, data, de_onde, para_onde, valor } = req.body;
    
    await query(
      'UPDATE motoboy_rotas SET motoboy_id = ?, data = ?, de_onde = ?, para_onde = ?, valor = ? WHERE id = ?',
      [motoboy_id, data, de_onde, para_onde, valor, id]
    );
    res.json({ message: 'Rota atualizada com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar rota' });
  }
});

// 6. Excluir Rota Específica
router.delete('/rotas/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM motoboy_rotas WHERE id = ?', [id]);
    res.json({ message: 'Rota excluída com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir rota' });
  }
});

export default router;
