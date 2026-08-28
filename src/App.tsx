import { useCallback, useEffect, useRef, useState } from 'react';
import './estilos/global.css';
import css from './ui/App.module.css';
import { StoreProvider, useStore, type ItemArquivo } from './estado/store';
import { iniciarOciosidade } from './infra/ociosidade';
import { descartar } from './infra/blobRegistry';
import { processarLote, type FabricaWorker } from './execucao/orquestrador';
import { AvisoPrivacidade } from './ui/AvisoPrivacidade';
import { AreaUpload } from './ui/AreaUpload';
import { BotaoValidar } from './ui/BotaoValidar';
import { ControlesDescarte } from './ui/ControlesDescarte';
import { ListaArquivos } from './ui/ListaArquivos';

interface PropsApp {
  /** Injetável em teste. Em produção, o orquestrador usa o worker real. */
  fabricaWorker?: FabricaWorker | undefined;
}

function AppInterno({ fabricaWorker }: PropsApp) {
  const { estado, dispatch } = useStore();
  const [validando, setValidando] = useState(false);
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

  const temAguardando = estado.itens.some((i) => i.estado === 'aguardando');

  return (
    <main className={css.raiz}>
      <h1 className={css.titulo}>Validador de arquivos para o PJe</h1>
      <p className={css.subtitulo}>
        Confira se um PDF, MP3 ou MP4 está pronto para anexar a uma petição — assinatura
        digital, tamanho e formato PDF/A. Tudo no seu navegador.
      </p>

      <AvisoPrivacidade />

      <AreaUpload
        totalAtual={estado.itens.length}
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
        <ControlesDescarte
          temItens={estado.itens.length > 0}
          ocioso={estado.ocioso}
          onLimparTudo={aoLimparTudo}
        />
      </div>

      <ListaArquivos itens={estado.itens} onRemover={aoRemover} />
    </main>
  );
}

export function App({ fabricaWorker }: PropsApp = {}) {
  return (
    <StoreProvider>
      <AppInterno fabricaWorker={fabricaWorker} />
    </StoreProvider>
  );
}
