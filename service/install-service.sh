#!/bin/bash

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then 
    echo "Por favor, execute como root (use sudo)"
    exit 1
fi

# Criar usuário se não existir
if ! id "edgital" &>/dev/null; then
    echo "Criando usuário edgital..."
    useradd -m -s /bin/bash edgital
fi

# Criar diretório do projeto se não existir
if [ ! -d "/home/edgital/totem_edgital" ]; then
    echo "Criando diretório do projeto..."
    mkdir -p /home/edgital/totem_edgital
fi

# Copiar arquivos do serviço
echo "Copiando arquivos do serviço..."
cp /home/edgital/totem_edgital/service/totem-digital.service /etc/systemd/system/

# Configurar permissões
echo "Configurando permissões..."
chown -R edgital:edgital /home/edgital/totem_edgital
chmod -R 755 /home/edgital/totem_edgital
chmod 644 /etc/systemd/system/totem-digital.service

# Recarregar systemd
echo "Recarregando systemd..."
systemctl daemon-reload

# Habilitar e iniciar o serviço
echo "Habilitando e iniciando o serviço..."
systemctl enable totem-digital
systemctl start totem-digital

# Verificar status
echo "Verificando status do serviço..."
systemctl status totem-digital

echo "Instalação concluída!"
echo "Para verificar os logs do serviço, use:"
echo "sudo journalctl -u totem-digital" 