import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Garantia estrutural de tabelas
const garantirColunas = async () => {
  try { await query("ALTER TABLE trabalhos ADD COLUMN data_saida TEXT"); } catch (e) {}
  try { await query("ALTER TABLE trabalhos ADD COLUMN forma_pagamento TEXT"); } catch (e) {}
  // Garante que a tabela das despesas gerais exista para não quebrar nenhuma rota
  try { 
    await query(`CREATE TABLE IF NOT EXISTS despesas_gerais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      data TEXT NOT NULL,
      tipo TEXT DEFAULT 'Geral',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`); 
  } catch (e) {}
};

// 1. Dashboard Inicial (Original Intacto)
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    await garantirColunas();
    
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    
    const dataInicio = new Date(hoje);
    dataInicio.setDate(hoje.getDate() - 1);
    const dataInicioStr = dataInicio.toISOString().split('T')[0];

    const emAndamento = await get('SELECT COUNT(*) as total FROM trabalhos WHERE status IN ("Pendente", "Em Andamento")');
    const receitaPeriodo = await get('SELECT SUM(valor_bruto) as total FROM trabalhos WHERE status = "Finalizado" AND IFNULL(data_saida, data_entrada) >= datetime("now", "-1 day")');
    const finalizados = await get('SELECT COUNT(*) as total FROM trabalhos WHERE status = "Finalizado"');
    const lucroLiquido = await get('SELECT SUM(lucro_liquido) as total FROM trabalhos WHERE status = "Finalizado"');
    const receitaPendente = await get('SELECT SUM(valor_bruto) as total FROM trabalhos WHERE status IN ("Pendente", "Em Andamento")');

    // AJUSTE: Deduz as despesas gerais do laboratório do Lucro Líquido do Dashboard
    const despesasGeraisTotal = await get('SELECT SUM(valor) as total FROM despesas_gerais');
    const lucroRealDashboard = (lucroLiquido?.total || 0) - (despesasGeraisTotal?.total || 0);

    res.json({
      emAndamento: emAndamento?.total || 0,
      receitaPeriodo: receitaPeriodo?.total || 0,
      finalizados: finalizados?.total || 0,
      lucroLiquido: lucroRealDashboard,
      receitaPendente: receitaPendente?.total || 0
    });
  } catch (error) {
    console.error('Erro no dashboard:', error);
    res.status(500).json({ error: 'Erro ao gerar dashboard' });
  }
});

// 2. Relatório Geral (Original Intacto com Injeções Financeiras)
router.get('/', verifyToken, async (req, res) => {
  try {
    await garantirColunas();
    
    const { data_inicio, data_fim } = req.query;
    
    let dIni = data_inicio;
    let dFim = data_fim;
    if (!dIni || !dFim) {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      dIni = firstDay.toISOString().split('T')[0];
      dFim = now.toISOString().split('T')[0];
    }

    // Busca original com t.* intacto
    const completedServices = await all(`
      SELECT t.*, p.nome as paciente_nome, p.telefone as paciente_telefone, d.nome as dentista_nome
      FROM trabalhos t
      LEFT JOIN pacientes p ON t.paciente_id = p.id
      LEFT JOIN dentistas d ON t.dentista_id = d.id
      WHERE t.status = "Finalizado" 
      AND IFNULL(t.data_saida, t.data_entrada) BETWEEN ? AND ?
      ORDER BY IFNULL(t.data_saida, t.data_entrada) DESC
    `, [dIni, dFim]);

    const monthlyData = await all(`
      SELECT 
        strftime('%m/%Y', IFNULL(data_saida, data_entrada)) as month,
        SUM(valor_bruto) as revenue,
        SUM(custo_operacional) as cost,
        SUM(lucro_liquido) as profit
      FROM trabalhos
      WHERE status = "Finalizado"
      AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?
      GROUP BY month
    `, [dIni, dFim]);

    const costsDistribution = await all(`
      SELECT descricao as name, SUM(valor) as value
      FROM custos
      WHERE data BETWEEN ? AND ?
      GROUP BY name
      ORDER BY value DESC
    `, [dIni, dFim]);

    const paymentMethods = await all(`
      SELECT IFNULL(forma_pagamento, 'Não Informado') as name, 
             SUM(valor_bruto) as value,
             COUNT(*) as count
      FROM trabalhos
      WHERE status = "Finalizado"
      AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?
      GROUP BY name
      ORDER BY value DESC
    `, [dIni, dFim]);

    const totals = await get(`
      SELECT SUM(valor_bruto) as revenue, SUM(custo_operacional) as cost, SUM(lucro_liquido) as profit
      FROM trabalhos 
      WHERE status = "Finalizado"
      AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?
    `, [dIni, dFim]);

    // AJUSTE 1: Puxa o total de despesas gerais do período para o fechamento de blocos (cards de totais)
    const despesasGeraisPeriodo = await get(`
      SELECT SUM(valor) as total FROM despesas_gerais WHERE data BETWEEN ? AND ?
    `, [dIni, dFim]);
    const totalDespesasGerais = despesasGeraisPeriodo?.total || 0;

    const receitaFinalPeriodo = totals?.revenue || 0;
    const custoFinalPeriodo = (totals?.cost || 0) + totalDespesasGerais;
    const lucroFinalPeriodo = (totals?.profit || 0) - totalDespesasGerais;

    // AJUSTE 2: Agrupa custos gerais por mês para enquadrar no Gráfico de Barras mensal de lucros/custos
    const despesasMensaisGerais = await all(`
      SELECT strftime('%m/%Y', data) as month, SUM(valor) as total_mes
      FROM despesas_gerais
      WHERE data BETWEEN ? AND ?
      GROUP BY month
    `, [dIni, dFim]);

    const adjustedMonthlyData = monthlyData.map(d => {
      const despesaDesteMes = despesasMensaisGerais.find(m => m.month === d.month);
      const valorDespMes = despesaDesteMes ? despesaDesteMes.total_mes : 0;
      return {
        month: d.month,
        revenue: d.revenue || 0,
        cost: (d.cost || 0) + valorDespMes,
        profit: (d.profit || 0) - valorDespMes
      };
    });

    if (costsDistribution.length === 0 && totals?.cost > 0) {
      costsDistribution.push({ name: 'Custos Gerais', value: totals.cost });
    }

    // AJUSTE 3: Adiciona a fatia das Despesas Gerais do Lab no Gráfico de Pizza
    if (totalDespesasGerais > 0) {
      costsDistribution.push({ name: 'Despesas Gerais (Lab)', value: totalDespesasGerais });
    }

    res.json({
      completedServices,
      monthlyData: adjustedMonthlyData.map(d => ({ month: d.month, revenue: d.revenue || 0, cost: d.cost || 0, profit: d.profit || 0 })),
      costsDistribution: costsDistribution.map(c => ({ name: c.name, value: c.value || 0 })),
      paymentMethods: paymentMethods.map(p => ({ name: p.name, value: p.value || 0, count: p.count || 0 })),
      totals: { revenue: receitaFinalPeriodo, cost: custoFinalPeriodo, profit: lucroFinalPeriodo }
    });
  } catch (error) {
    console.error('Erro no relatório:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

export default router;
