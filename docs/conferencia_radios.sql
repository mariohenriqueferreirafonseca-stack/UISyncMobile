CREATE TABLE dbo.ConferenciaRadios (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    LocalId NVARCHAR(60) NOT NULL,
    NumeroSelo NVARCHAR(100) NOT NULL,
    EquipamentoOperante NVARCHAR(30) NOT NULL,
    BotaoFunciona NVARCHAR(30) NOT NULL,
    BateriaEncaixa NVARCHAR(30) NOT NULL,
    ExistemRachaduras NVARCHAR(30) NOT NULL,
    RiscosProfundos NVARCHAR(30) NOT NULL,
    CapaProtetora NVARCHAR(30) NOT NULL,
    AlcaTransporte NVARCHAR(30) NOT NULL,
    IdentificacaoIntegra NVARCHAR(30) NOT NULL,
    EquipamentoLimpo NVARCHAR(30) NOT NULL,
    SituacaoGeral NVARCHAR(30) NOT NULL,    
    Observacao NVARCHAR(MAX) NULL,
    DataCriacaoApp DATETIME2 NOT NULL,
    DataAtualizacaoApp DATETIME2 NOT NULL,
    DataRecebimentoServidor DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE UNIQUE INDEX IX_ConferenciaRadios_LocalId
    ON dbo.ConferenciaRadios (LocalId);

SELECT TOP (50)
    RadioSeloComplemento
FROM dbo.dimRadios
WHERE RadioSeloComplemento LIKE '%' + @query + '%'
ORDER BY RadioSeloComplemento;
