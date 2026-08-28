import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renderiza o título da ferramenta', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', { name: /validador de arquivos para o pje/i }),
  ).toBeInTheDocument();
});
