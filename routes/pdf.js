import express from 'express';
import PDFDocument from 'pdfkit';
import { get, all } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Gerar PDF do trabalho para envio ao dentista
router.get('/trabalho/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Obter dados do trabalho
    const trabalho = await get(
      `SELECT t.*, p.nome as paciente_nome, p.telefone as paciente_telefone, p.cpf as paciente_cpf, 
              d.nome as dentista_nome, d.telefone as dentista_telefone, d.email as dentista_email,
              tp.nome as tipo_protese_nome
       FROM trabalhos t 
       LEFT JOIN pacientes p ON t.paciente_id = p.id 
       LEFT JOIN dentistas d ON t.dentista_id = d.id 
       LEFT JOIN tipos_protese tp ON t.tipo_protese_id = tp.id 
       WHERE t.id = ?`,
      [id]
    );

    if (!trabalho) {
      return res.status(404).json({ error: 'Trabalho não encontrado' });
    }

    // Obter etapas
    const etapas = await all('SELECT * FROM etapas WHERE trabalho_id = ? ORDER BY ordem ASC', [id]);

    // Criar documento PDF
    const doc = new PDFDocument({ margin: 50 });

    // Headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-${trabalho.id}.pdf"`);
    doc.pipe(res);

    // Cabeçalho
    doc.fontSize(24).font('Helvetica-Bold').text('ALINE ANTUNES', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('Prótese Odontológica', { align: 'center' });
    doc.fontSize(10).text('Laboratório de Prótese Dentária', { align: 'center' });
    doc.moveDown(0.5);

    // Linha separadora
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Título
    doc.fontSize(16).font('Helvetica-Bold').text('RELATÓRIO DE SERVIÇO', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Protocolo: #${trabalho.id}`, { align: 'center' });
    doc.moveDown(0.5);

    // Linha separadora
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Seção: Informações do Paciente
    doc.fontSize(12).font('Helvetica-Bold').text('INFORMAÇÕES DO PACIENTE');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Nome: ${trabalho.paciente_nome || 'N/A'}`);
    doc.text(`Telefone: ${trabalho.paciente_telefone || 'N/A'}`);
    doc.text(`CPF: ${trabalho.paciente_cpf || 'N/A'}`);
    doc.moveDown(0.5);

    // Seção: Informações do Dentista
    doc.fontSize(12).font('Helvetica-Bold').text('DENTISTA RESPONSÁVEL');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Nome: ${trabalho.dentista_nome || 'N/A'}`);
    doc.text(`Telefone: ${trabalho.dentista_telefone || 'N/A'}`);
    doc.text(`Email: ${trabalho.dentista_email || 'N/A'}`);
    doc.moveDown(0.5);

    // Seção: Detalhes do Trabalho
    doc.fontSize(12).font('Helvetica-Bold').text('DETALHES DO TRABALHO');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Tipo de Prótese: ${trabalho.tipo_protese_nome || trabalho.procedimento}`);
    doc.text(`Descrição: ${trabalho.descricao}`);
    doc.text(`Data de Entrada: ${trabalho.data_entrada}`);
    doc.text(`Data de Saída: ${trabalho.data_saida || 'Pendente'}`);
    doc.text(`Status: ${trabalho.status}`);
    doc.text(`Prioridade: ${trabalho.prioridade || 'Normal'}`);
    if (trabalho.prazo_entrega) {
      doc.text(`Prazo de Entrega: ${trabalho.prazo_entrega}`);
    }
    doc.moveDown(0.5);

    // Seção: Resumo do Trabalho
    if (trabalho.resumo_trabalho) {
      doc.fontSize(12).font('Helvetica-Bold').text('RESUMO DO TRABALHO');
      doc.fontSize(10).font('Helvetica').text(trabalho.resumo_trabalho, { align: 'justify' });
      doc.moveDown(0.5);
    }

    // Seção: Etapas Realizadas
    if (etapas.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('ETAPAS REALIZADAS');
      doc.fontSize(10).font('Helvetica');
      etapas.forEach((etapa, index) => {
        const status = etapa.status === 'Concluído' ? '✓' : '○';
        doc.text(`${status} ${etapa.nome} - ${etapa.status}`);
        if (etapa.descricao) {
          doc.fontSize(9).text(`   ${etapa.descricao}`, { indent: 20 });
          doc.fontSize(10);
        }
      });
      doc.moveDown(0.5);
    }

    // Seção: Valor do Serviço
    doc.fontSize(12).font('Helvetica-Bold').text('VALOR DO SERVIÇO');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Valor Cobrado: R$ ${(trabalho.valor_bruto || 0).toFixed(2)}`);
    if (trabalho.forma_pagamento) {
      doc.text(`Forma de Pagamento: ${trabalho.forma_pagamento}`);
    }
    doc.moveDown(0.5);

    // Seção: Observações
    if (trabalho.observacoes) {
      doc.fontSize(12).font('Helvetica-Bold').text('OBSERVAÇÕES');
      doc.fontSize(10).font('Helvetica').text(trabalho.observacoes, { align: 'justify' });
      doc.moveDown(0.5);
    }

    // Rodapé
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').text('Documento gerado automaticamente pelo Sistema LabPro', { align: 'center' });
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, { align: 'center' });
    doc.text('Aline Antunes Prótese Odontológica', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    res.status(500).json({ error: 'Erro ao gerar PDF' });
  }
});

export default router;
