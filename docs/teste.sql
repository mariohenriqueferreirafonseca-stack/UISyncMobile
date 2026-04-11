SELECT
    [NFDataMovimento] AS [DataMovimento],
    [ChaveSetor] AS [SetorNumero],
    [ChaveFilial] AS [Lac],
    [ChaveProduto] AS [ProdutoCodigo],
    [ChaveCliente] AS [MatriculaFornecedor],
    [NFNumero] AS [NumeroNF],
    [dimOperacao].[ChaveOperacao] AS [CMI],
    [OperacaoDescricao] AS [CMIDescricao],
    [NFItemQtde] AS [Quantidade],
    [NFItemValor] AS [ValorEntrada]
FROM [UIS].[fatoNotaFiscal] 
INNER JOIN [dimOperacao] ON [dimOperacao].[ChaveOperacao] = [fatoNotaFiscal].[ChaveOperacao]
WHERE [ChaveFilial] IN ('CT-124')
AND ChaveProduto = 'CT-172584';