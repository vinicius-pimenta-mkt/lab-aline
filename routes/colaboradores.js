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

// Rota de Pagamento Blindada contra Erro 500
router.post('/pagamento', verifyToken, async (req, res) => {
  try {
    const { colaborador_nome, valor, mes_ref } = req.body;
    const hoje = new Date().toISOString().split('T')[0];
    const textoDescricao = `Pagamento Colaborador: ${colaborador_nome} (${mes_ref})`;

    try {
      // Tentativa 1: Omitindo trabalho_id para evitar erros de restrição NOT NULL / FOREIGN KEY
      await query(
        "INSERT INTO custos (nome, valor, data) VALUES (?, ?, ?)",
        [textoDescricao, valor, hoje]
      );
    } catch (firstErr) {
      console.warn("Coluna 'nome' não encontrada ou rejeitada, tentando coluna 'descricao'...");
      // Tentativa 2: Caso a coluna na tabela de custos chame-se 'descricao' em vez de 'nome'
      await query(
        "INSERT INTO custos (descricao, valor, data) VALUES (?, ?, ?)",
        [textoDescricao, valor, hoje]
      );
    }

    res.json({ message: 'Pagamento registrado no financeiro com sucesso!' });
  } catch (err) {
    // Esse console.error vai printar o motivo exato no terminal do seu Easypanel caso ainda falhe
    console.error("Erro fatal ao lançar pagamento de colaborador no banco:", err);
    res.status(500).json({ error: 'Erro interno ao salvar na tabela custos. Verifique os campos.' });
  }
});

export default router;
