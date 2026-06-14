import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Função para garantir que as colunas existem (evita erro 500)
const garantirColunas = async () => {
  try { await query("ALTER TABLE trabalhos ADD COLUMN data_saida TEXT"); } catch (e) {}
  try { await query("ALTER TABLE trabalhos ADD COLUMN forma_pagamento TEXT"); } catch (e) {}
};

router.get('/completo', verifyToken, async (req, res) => {
  try {
    await garantirColunas();
    
    const { periodo = 'mes' } = req.query;
    
    // Cálculo das datas de filtro
    const hoje = new Date();
    let dataInicio = new Date();
    
    if (periodo === 'hoje') {
      dataInicio.setDate(hoje.getDate());
    } else if (periodo === 'semana') {
      dataInicio.setDate(hoje.getDate() - 7);
    } else if (periodo === 'quinzena') {
      dataInicio.setDate(hoje.getDate() - 15);
    } else {
      // Padrão: Mês
      dataInicio.setMonth(hoje.getMonth() - 1);
    }
    
    const dIni = dataInicio.toISOString().split('T')[0] + ' 00:00:00';
    const dFim = hoje.toISOString().split('T')[0] + ' 23:59:59';

    // Consulta de Serviços Finalizados (Usa IFNULL para garantir que pegue a data correta)
    const completedServices = await all(`
      SELECT 
        t.id, 
        p.nome as patient, 
        d.nome as dentist, 
        t.procedimento as procedure, 
        t.valor_bruto as grossValue, 
        t.custo_operacional as operationCost, 
        (t.valor_bruto - t.custo_operacional) as netProfit, 
        IFNULL(t.data_saida, t.data_entrada) as completedAt,
        IFNULL(t.forma_pagamento, 'Não Informado') as forma_pagamento
      FROM trabalhos t
      LEFT JOIN pacientes p ON t.paciente_id = p.id
      LEFT JOIN dentistas d ON t.dentista_id = d.id
      WHERE t.status = "Finalizado"
      AND IFNULL(t.data_saida, t.data_entrada) BETWEEN ? AND ?
      ORDER BY completedAt DESC
    `, [dIni, dFim]);

    // Totais de Receita/Custo/Lucro para os KPIs
    const totals = await get(`
      SELECT 
        SUM(valor_bruto) as revenue, 
        SUM(custo_operacional) as cost, 
        SUM(valor_bruto - custo_operacional) as profit
      FROM trabalhos 
      WHERE status = "Finalizado"
      AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?
    `, [dIni, dFim]);

    // Pagamentos
    const paymentMethods = await all(`
      SELECT 
        IFNULL(forma_pagamento, 'Não Informado') as name, 
        SUM(valor_bruto) as value,
        COUNT(*) as count
      FROM trabalhos
      WHERE status = "Finalizado"
      AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?
      GROUP BY name
    `, [dIni, dFim]);

    // Retorna tudo para o seu Reports.tsx
    res.json({
      completedServices,
      paymentMethods,
      totals: totals || { revenue: 0, cost: 0, profit: 0 }
    });

  } catch (error) {
    console.error('Erro ao compilar relatórios:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
