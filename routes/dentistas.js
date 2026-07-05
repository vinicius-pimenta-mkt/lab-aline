import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Listar todos os dentistas
router.get('/', verifyToken, async (req, res) => {
  try {
    const dentistas = await all('SELECT * FROM dentistas ORDER BY nome ASC');
    res.json(dentistas);
  } catch (error) {
    console.error('Erro ao listar dentistas:', error);
    res.status(500).json({ error: 'Erro ao listar dentistas' });
  }
});

// Obter dentista por ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const dentista = await get('SELECT * FROM dentistas WHERE id = ?', [id]);
    
    if (!dentista) {
      return res.status(404).json({ error: 'Dentista não encontrado' });
    }
    
    res.json(dentista);
  } catch (error) {
    console.error('Erro ao obter dentista:', error);
    res.status(500).json({ error: 'Erro ao obter dentista' });
  }
});

// Criar ou Atualizar Dentista (Impede duplicatas da tela de Parceiros)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { nome, telefone, cidade, aniversario_dia, aniversario_mes } = req.body;
    
    if (!nome) return res.status(400).json({ error: 'O nome é obrigatório' });

    // 1. Verifica se já existe (usando TRIM e LIKE para ignorar espaços ocultos e maiúsculas)
    const dentistaExistente = await get('SELECT id FROM dentistas WHERE TRIM(nome) LIKE ?', [nome.trim()]);
    
    if (dentistaExistente) {
      // Se a Aline tentar cadastrar alguém que já existe, apenas ATUALIZA os dados em vez de duplicar
      await query(
        'UPDATE dentistas SET telefone = ?, cidade = ?, aniversario_dia = ?, aniversario_mes = ? WHERE id = ?',
        [telefone || '', cidade || '', aniversario_dia || null, aniversario_mes || null, dentistaExistente.id]
      );
      return res.json({ id: dentistaExistente.id, message: 'Dentista atualizado com sucesso' });
    }

    // 2. Se não existir, cria a ficha limpa
    const result = await query(
      'INSERT INTO dentistas (nome, telefone, cidade, aniversario_dia, aniversario_mes) VALUES (?, ?, ?, ?, ?)',
      [nome.trim(), telefone || '', cidade || '', aniversario_dia || null, aniversario_mes || null]
    );
    res.json({ id: result.lastID, message: 'Dentista criado com sucesso' });
  } catch (error) {
    console.error('Erro ao criar parceiro:', error);
    res.status(500).json({ error: 'Erro interno ao salvar parceiro' });
  }
});

// Atualizar dentista
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, telefone, email, cpf, cidade, aniversario_dia, aniversario_mes } = req.body;

    const dentista = await get('SELECT * FROM dentistas WHERE id = ?', [id]);
    if (!dentista) {
      return res.status(404).json({ error: 'Dentista não encontrado' });
    }

    await query(
      'UPDATE dentistas SET nome = ?, telefone = ?, email = ?, cpf = ?, cidade = ?, aniversario_dia = ?, aniversario_mes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        nome || dentista.nome, 
        telefone || dentista.telefone, 
        email || dentista.email, 
        cpf || dentista.cpf,
        cidade !== undefined ? cidade : dentista.cidade,
        aniversario_dia !== undefined ? aniversario_dia : dentista.aniversario_dia,
        aniversario_mes !== undefined ? aniversario_mes : dentista.aniversario_mes,
        id
      ]
    );

    res.json({ message: 'Dentista atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar dentista:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'CPF já cadastrado' });
    }
    res.status(500).json({ error: 'Erro ao atualizar dentista' });
  }
});

// Deletar dentista
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const dentista = await get('SELECT * FROM dentistas WHERE id = ?', [id]);
    if (!dentista) {
      return res.status(404).json({ error: 'Dentista não encontrado' });
    }

    await query('DELETE FROM dentistas WHERE id = ?', [id]);
    res.json({ message: 'Dentista deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar dentista:', error);
    res.status(500).json({ error: 'Erro ao deletar dentista' });
  }
});

export default router;
