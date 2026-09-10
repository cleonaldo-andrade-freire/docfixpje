import { expect, test } from 'vitest';
import { corrigirMidia } from './corrigirMidia';
import { saidaCorrigida } from './nomeCorrigido';
import { validarArquivo } from '../validadores/validarArquivo';
import { lerFixture } from '../../scripts/lib/ler-fixture';

test('QuickTime -> MP4: sucesso, e o arquivo de saída revalida como apto', async () => {
  const bytes = lerFixture('video-quicktime.mp4');
  const { resultado, bytesCorrigidos } = await corrigirMidia({
    nomeArquivo: 'AUDIENCIA.MP4',
    bytes,
  });

  expect(resultado.sucesso).toBe(true);
  expect(resultado.estrategias).toEqual(['REMUXAR_MP4']);
  expect(resultado.revalidacao.apto).toBe(true);
  expect(bytesCorrigidos).not.toBeNull();

  const r = await validarArquivo('AUDIENCIA-corrigido.mp4', bytesCorrigidos!);
  expect(r.tipoDetectado).toBe('video/mp4');
  expect(r.apto).toBe(true);
});

test('as etapas descrevem que não há recodificação', async () => {
  const etapas: string[] = [];
  await corrigirMidia({
    nomeArquivo: 'v.mp4',
    bytes: lerFixture('video-quicktime.mp4'),
    onEtapa: (e) => etapas.push(e),
  });
  expect(etapas[0]).toMatch(/sem recodificar/i);
  expect(etapas).toContain('Revalidando o arquivo corrigido…');
});

test('arquivo que não dá para remuxar falha sem lançar, com motivo no aviso', async () => {
  const { resultado, bytesCorrigidos } = await corrigirMidia({
    nomeArquivo: 'v.mp4',
    bytes: lerFixture('video-sem-trilha.mp4'),
  });
  expect(resultado.sucesso).toBe(false);
  expect(bytesCorrigidos).toBeNull();
  expect(resultado.avisos.join(' ')).toMatch(/trilha/);
});

test('saidaCorrigida normaliza a extensão de vídeo para .mp4', () => {
  expect(saidaCorrigida('AUDIENCIA.MP4', 'video/quicktime')).toEqual({
    nome: 'AUDIENCIA-corrigido.mp4',
    mime: 'video/mp4',
  });
  expect(saidaCorrigida('gravacao.MOV', 'video/quicktime').nome).toBe('gravacao-corrigido.mp4');
  expect(saidaCorrigida('doc.pdf', 'application/pdf')).toEqual({
    nome: 'doc-corrigido.pdf',
    mime: 'application/pdf',
  });
});
