@echo off
title Publicando Site no Netlify

echo ==========================================================
echo  PUBLICANDO ATUALIZACOES PARA O SITE NO NETLIFY
echo ==========================================================
echo.
echo Lembre-se: Antes de rodar este script, salve todas as
echo alteracoes e exporte o seu 'products.json'!
echo.
pause
echo.
echo Enviando arquivos... Por favor, aguarde.
echo.

rem O comando '--prod' garante que estamos publicando na versao principal (producao) do site
netlify deploy --prod

echo.
echo ==========================================================
echo  PROCESSO CONCLUIDO!
echo ==========================================================
echo.
echo Verifique o status da publicacao no painel do Netlify.
echo O site deve estar atualizado em alguns instantes.
echo.
pause