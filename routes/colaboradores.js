import express from 'express';
import { all, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// 1. Listar e Criar Colaboradores
router.get('/', verifyToken, async (req, res) => {
  try {
    const cols = await all('SELECT * FROM colaboradores ORDER BY nome ASC');
    res.json(cols);
  } catch (err) { res.status(500).json({error: 'Erro ao listar colaboradores'}); }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const { nome, telefone, cargo } = req.body;
    const r = await query('INSERT INTO colaboradores (nome, telefone, cargo) VALUES (?, ?, ?)', [nome, telefone, cargo]);
    res.json({ id: r.lastID });
  } catch (err) { res.status(500).json({error: 'Erro ao criar colaborador'}); }
});

// 2. Listar, Criar e Deletar Pontos (Horários)
router.get('/pontos', verifyToken, async (req, res) => {
  try {
    const pontos = await all('SELECT * FROM colaborador_ponto ORDER BY data DESC, entrada DESC');
    res.json(pontos);
  } catch (err) { res.status(500).json({error: 'Erro ao listar pontos'}); }
});

router.post('/pontos', verifyToken, async (req, res) => {
  try {
    const { colaborador_id, data, entrada, saida } = req.body;
    await query('INSERT INTO colaborador_ponto (colaborador_id, data, entrada, saida) VALUES (?, ?, ?, ?)', [colaborador_id, data, entrada, saida]);
    res.json({ message: 'Ponto registrado' });
  } catch (err) { res.status(500).json({error: 'Erro ao registrar ponto'}); }
});

router.delete('/pontos/:id', verifyToken, async (req, res) => {
  try {
    await query('DELETE FROM colaborador_ponto WHERE id = ?', [req.params.id]);
    res.json({ message: 'Ponto deletado' });
  } catch (err) { res.status(500).json({error: 'Erro ao deletar ponto'}); }
});

// 3. Rota de Pagamento (Lança o valor nos Custos Gerais do Sistema!)
router.post('/pagamento', verifyToken, async (req, res) => {
  try {
    const { colaborador_nome, valor, mes_ref } = req.body;
    const hoje = new Date().toISOString().split('T')[0]; // Pega a data atual
    
    // Insere o salário/pagamento diretamente na tabela de custos para abater no Lucro do Mês
    await query(
      "INSERT INTO custos (trabalho_id, nome, valor, data) VALUES (NULL, ?, ?, ?)",
      [`Pagamento Colaborador: ${colaborador_nome} (${mes_ref})`, valor, hoje]
    );
    res.json({ message: 'Pagamento registrado no financeiro com sucesso!' });
  } catch (err) { res.status(500).json({error: 'Erro ao lançar pagamento'}); }
});

export default router;
