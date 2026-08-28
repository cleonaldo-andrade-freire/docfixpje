import { useCallback, useEffect, useRef, useState } from 'react';
import './estilos/global.css';
import css from './ui/App.module.css';
import { StoreProvider, useStore, type ItemArquivo } from './estado/store';
import { iniciarOciosidade } from './infra/ociosidade';
import { criarDownload, descartar } from './infra/blobRegistry';
import { processarLote, type FabricaWorker } from './execucao/orquestrador';
import { corrigirArquivo, type FabricaWorkerCorrecao } from './correcao/corrigirArquivo';
import { nomeCorrigido } from './correcao/nomeCorrigido';
import { AvisoPrivacidade } from './ui/AvisoPrivacidade';
import { AvisoLegalCorrecao } from './ui/AvisoLegalCorrecao';
import { AreaUpload } from './ui/AreaUpload';
import { BotaoValidar } from './ui/BotaoValidar';
import { ControlesDescarte } from './ui/ControlesDescarte';
import { ListaArquivos } from './ui/ListaArquivos';

interface PropsApp {
  /** Injetáveis em teste. Em produção, os orquestradores usam os workers reais. */
  fabricaWorker?: FabricaWorker | undefined;
  fabricaWorkerCorrecao?: FabricaWorkerCorrecao | undefined;
}

function AppInterno({ fabricaWorker, fabricaWorkerCorrecao }: PropsApp) {
  const { estado, dispatch } = useStore();
  const [validando, setValidando] = useState(false);
  const [corrigindoId, setCorrigindoId] = useState<string | null>(null);
  const [avisoLegalMostrado, setAvisoLegalMostrado] = useState(false);
  const ociosidadeRef = useRef<ReturnType<typeof iniciarOciosidade> | null>(null);

  useEffect(() => {
    const c = iniciarOciosidade(() => dispatch({ t: 'ociosidadeExpirou' }));
    ociosidadeRef.current = c;
    return () => c.parar();
  }, [dispatch]);

  const cutucar = () => ociosidadeRef.current?.cutucar();

  const aoAdicionar = useCallback(
    (itens: ItemArquivo[]) => {
      dispatch({ t: 'adicionar', itens });
      cutucar();
    },
    [dispatch],
  );

  const aoRemover = useCallback(
    (id: string) => {
      descartar(id);
      dispatch({ t: 'remover', id });
    },
    [dispatch],
  );

  const aoLimparTudo = useCallback(() => dispatch({ t: 'limparTudo' }), [dispatch]);

  const aoValidar = useCallback(async () => {
    const alvos = estado.itens.filter((i) => i.estado === 'aguardando');
    if (alvos.length === 0) return;
    const ids = alvos.map((i) => i.id);
    setValidando(true);
    cutucar();
    try {
      await processarLote(
        alvos.map((i) => i.file),
        {
          onEstado: (idx, e) => dispatch({ t: 'estado', id: ids[idx]!, estado: e }),
          onEtapa: (idx, m) => dispatch({ t: 'etapa', id: ids[idx]!, etapa: m }),
          onResultado: (idx, r) => dispatch({ t: 'resultado', id: ids[idx]!, resultado: r }),
        },
        fabricaWorker,
      );
    } finally {
      setValidando(false);
    }
  }, [estado.itens, dispatch, fabricaWorker]);

  const aoBaixarOriginal = useCallback((item: ItemArquivo) => {
    const { url } = criarDownload(`${item.id}-orig`, item.file, item.file.name);
    baixar(url, item.file.name);
  }, []);

  const aoCorrigir = useCallback(
    async (id: string) => {
      const item = estado.itens.find((i) => i.id === id);
      if (!item || !item.resultado) return;
      if (!avisoLegalMostrado) setAvisoLegalMostrado(true);
      setCorrigindoId(id);
      cutucar();
      dispatch({ t: 'estado', id, estado: 'corrigindo' });
      try {
        const bytes = await item.file.arrayBuffer();
        const saida = await corrigirArquivo({
          nomeArquivo: item.file.name,
          tipo: item.resultado.tipoDetectado,
          bytes,
          ocorrencias: item.resultado.ocorrencias,
          cb: {
            onEtapa: (m) => dispatch({ t: 'etapa', id, etapa: m }),
          },
          ...(fabricaWorkerCorrecao ? { fabricaWorker: fabricaWorkerCorrecao } : {}),
        });

        dispatch({
          t: 'correcaoConcluida',
          id,
          resultado: saida.resultado,
          orientacao: saida.orientacao ?? null,
        });

        if (saida.estadoDestino === 'corrigido' && saida.bufferCorrigido) {
          const nome = nomeCorrigido(item.file.name);
          const blob = new Blob([saida.bufferCorrigido], { type: 'application/pdf' });
          const { url } = criarDownload(id, blob, nome);
          dispatch({ t: 'correcao', id, nome, url });
        }
        dispatch({ t: 'estado', id, estado: saida.estadoDestino });
      } finally {
        setCorrigindoId(null);
      }
    },
    [estado.itens, dispatch, fabricaWorkerCorrecao, avisoLegalMostrado],
  );

  const temAguardando = estado.itens.some((i) => i.estado === 'aguardando');

  const total = estado.itens.length;

  return (
    <main className={css.raiz}>
      <header className={css.cabecalho}>
        <h1 className={css.titulo}>Validador de arquivos para o PJe</h1>
        <p className={css.subtitulo}>
          Confira se um PDF, MP3 ou MP4 está pronto para anexar a uma petição — assinatura
          digital, tamanho e formato PDF/A. Tudo no seu navegador.
        </p>
      </header>

      <AvisoPrivacidade />

      <AreaUpload
        totalAtual={total}
        onArquivos={aoAdicionar}
        onRecusa={(motivo) => dispatch({ t: 'recusar', motivo })}
      />
      {estado.recusa && (
        <p className={css.recusa} role="alert">
          {estado.recusa}
        </p>
      )}

      <div className={css.acoes}>
        <BotaoValidar habilitado={temAguardando} validando={validando} onValidar={aoValidar} />
        <ControlesDescarte temItens={total > 0} ocioso={estado.ocioso} onLimparTudo={aoLimparTudo} />
        {total > 0 && (
          <span className={`${css.contador} num-tabular`}>
            {total} {total === 1 ? 'arquivo' : 'arquivos'}
          </span>
        )}
      </div>

      {avisoLegalMostrado && <AvisoLegalCorrecao />}

      <ListaArquivos
        itens={estado.itens}
        onRemover={aoRemover}
        onCorrigir={aoCorrigir}
        onBaixarOriginal={aoBaixarOriginal}
        corrigindoAlgum={corrigindoId !== null}
      />
    </main>
  );
}

function baixar(url: string, nome: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function App({ fabricaWorker, fabricaWorkerCorrecao }: PropsApp = {}) {
  return (
    <StoreProvider>
      <AppInterno
        fabricaWorker={fabricaWorker}
        fabricaWorkerCorrecao={fabricaWorkerCorrecao}
      />
    </StoreProvider>
  );
}
