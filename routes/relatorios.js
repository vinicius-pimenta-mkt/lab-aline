import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Função que blinda o banco de dados contra erros de colunas inexistentes
const garantirColunas = async () => {
  try { await query("ALTER TABLE trabalhos ADD COLUMN data_saida TEXT"); } catch (e) {}
  try { await query("ALTER TABLE trabalhos ADD COLUMN forma_pagamento TEXT"); } catch (e) {}
};

// Dashboard (Mantendo a sua estrutura original)
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const emAndamento = await get('SELECT COUNT(*) as total FROM trabalhos WHERE status IN ("Pendente", "Em Andamento")');
    const finalizados = await get('SELECT COUNT(*) as total FROM trabalhos WHERE status = "Finalizado"');
    res.json({ kpis: { emAndamento: emAndamento.total, finalizados: finalizados.total } });
  } catch (error) {
    res.status(500).json({ error: 'Erro no dashboard' });
  }
});

// Resumo (Mantendo a sua estrutura original)
router.get('/resumo', verifyToken, async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    const totais = await get('SELECT SUM(valor_bruto) as receita, SUM(custo_operacional) as custo, SUM(lucro_liquido) as lucro FROM trabalhos WHERE status = "Finalizado" AND data_entrada BETWEEN ? AND ?', [data_inicio, data_fim]);
    res.json({ totais });
  } catch (error) {
    res.status(500).json({ error: 'Erro no resumo' });
  }
});

// Por Pagamento (Mantendo a sua estrutura original)
router.get('/por-pagamento', verifyToken, async (req, res) => {
  try {
    await garantirColunas();
    const { data_inicio, data_fim } = req.query;
    const resultado = await all('SELECT IFNULL(forma_pagamento, "Não Informado") as forma_pagamento, SUM(valor_bruto) as valor FROM trabalhos WHERE status = "Finalizado" AND data_entrada BETWEEN ? AND ? GROUP BY forma_pagamento', [data_inicio, data_fim]);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: 'Erro no relatório' });
  }
});

// Rota Completa (Integrada com o seu Reports.tsx)
router.get('/completo', verifyToken, async (req, res) => {
  try {
    await garantirColunas();
    const { periodo = 'mes' } = req.query;

    // Lógica de datas do filtro
    const hoje = new Date();
    let dataInicio = new Date();
    if (periodo === 'hoje') dataInicio.setDate(hoje.getDate());
    else if (periodo === 'semana') dataInicio.setDate(hoje.getDate() - 7);
    else if (periodo === 'quinzena') dataInicio.setDate(hoje.getDate() - 15);
    else dataInicio.setMonth(hoje.getMonth() - 1);
    
    const dIni = dataInicio.toISOString().split('T')[0];
    const dFim = hoje.toISOString().split('T')[0];

    // Consultas usando apenas o que sabemos que existe
    const completedServices = await all(`
      SELECT t.id, p.nome as patient, d.nome as dentist, t.procedimento as procedure, 
             t.valor_bruto as grossValue, t.custo_operacional as operationCost, 
             t.lucro_liquido as netProfit, IFNULL(t.data_saida, t.data_entrada) as completedAt,
             IFNULL(t.forma_pagamento, 'Não Informado') as forma_pagamento
      FROM trabalhos t
      LEFT JOIN pacientes p ON t.paciente_id = p.id
      LEFT JOIN dentistas d ON t.dentista_id = d.id
      WHERE t.status = "Finalizado"
      AND IFNULL(t.data_saida, t.data_entrada) BETWEEN ? AND ?
      ORDER BY completedAt DESC
    `, [dIni, dFim]);

    const totals = await get(`
      SELECT SUM(valor_bruto) as revenue, SUM(custo_operacional) as cost, SUM(lucro_liquido) as profit
      FROM trabalhos WHERE status = "Finalizado" AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?
    `, [dIni, dFim]);

    const paymentMethods = await all(`
      SELECT IFNULL(forma_pagamento, 'Não Informado') as name, SUM(valor_bruto) as value
      FROM trabalhos WHERE status = "Finalizado" AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?
      GROUP BY forma_pagamento
    `, [dIni, dFim]);

    res.json({
      completedServices,
      paymentMethods,
      totals: totals || { revenue: 0, cost: 0, profit: 0 }
    });

  } catch (error) {
    console.error('Erro na rota /completo:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
