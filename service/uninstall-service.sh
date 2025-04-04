#!/bin/bash

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then 
    echo "Por favor, execute como root (use sudo)"
    exit 1
fi

echo "Iniciando desinstalação do serviço Totem Digital..."

# Parar o serviço
echo "Parando o serviço..."
systemctl stop totem-digital

# Desabilitar o serviço
echo "Desabilitando o serviço..."
systemctl disable totem-digital

# Remover arquivo do serviço
echo "Removendo arquivo do serviço..."
rm -f /etc/systemd/system/totem-digital.service

# Recarregar systemd
echo "Recarregando systemd..."
systemctl daemon-reload

echo "Desinstalação concluída com sucesso!"
echo "Para verificar se o serviço foi removido, use:"
echo "sudo systemctl status totem-digital" 