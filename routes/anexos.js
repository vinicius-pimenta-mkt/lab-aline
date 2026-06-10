import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Listar anexos de um trabalho
router.get('/trabalho/:trabalho_id', verifyToken, async (req, res) => {
  try {
    const { trabalho_id } = req.params;
    
    const anexos = await all(
      'SELECT * FROM anexos WHERE trabalho_id = ? ORDER BY data_upload DESC',
      [trabalho_id]
    );
    
    res.json(anexos);
  } catch (error) {
    console.error('Erro ao listar anexos:', error);
    res.status(500).json({ error: 'Erro ao listar anexos' });
  }
});

// Obter anexo por ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const anexo = await get('SELECT * FROM anexos WHERE id = ?', [id]);
    
    if (!anexo) {
      return res.status(404).json({ error: 'Anexo não encontrado' });
    }
    
    res.json(anexo);
  } catch (error) {
    console.error('Erro ao obter anexo:', error);
    res.status(500).json({ error: 'Erro ao obter anexo' });
  }
});

// Criar anexo (nota: em produção, usar multer para upload de arquivos)
// Por enquanto, aceita URL de arquivo externo
router.post('/', verifyToken, async (req, res) => {
  try {
    const { trabalho_id, tipo, url, descricao } = req.body;

    if (!trabalho_id || !tipo || !url) {
      return res.status(400).json({ error: 'trabalho_id, tipo e url são obrigatórios' });
    }

    // Validar tipo
    const tiposValidos = ['foto', 'radiografia', 'referencia', 'outro'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de anexo inválido' });
    }

    const result = await query(
      'INSERT INTO anexos (trabalho_id, tipo, url, descricao) VALUES (?, ?, ?, ?)',
      [trabalho_id, tipo, url, descricao || null]
    );

    res.status(201).json({
      message: 'Anexo criado com sucesso',
      id: result.lastID
    });
  } catch (error) {
    console.error('Erro ao criar anexo:', error);
    res.status(500).json({ error: 'Erro ao criar anexo' });
  }
});

// Atualizar anexo
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { descricao } = req.body;

    const anexo = await get('SELECT * FROM anexos WHERE id = ?', [id]);
    if (!anexo) {
      return res.status(404).json({ error: 'Anexo não encontrado' });
    }

    await query(
      'UPDATE anexos SET descricao = ? WHERE id = ?',
      [descricao || anexo.descricao, id]
    );

    res.json({ message: 'Anexo atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar anexo:', error);
    res.status(500).json({ error: 'Erro ao atualizar anexo' });
  }
});

// Deletar anexo
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const anexo = await get('SELECT * FROM anexos WHERE id = ?', [id]);
    if (!anexo) {
      return res.status(404).json({ error: 'Anexo não encontrado' });
    }

    await query('DELETE FROM anexos WHERE id = ?', [id]);
    res.json({ message: 'Anexo deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar anexo:', error);
    res.status(500).json({ error: 'Erro ao deletar anexo' });
  }
});

export default router;
