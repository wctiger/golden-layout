import { expect, it } from 'vite-plus/test';
import { render } from 'vitest-browser-react';

it('renders React in a real browser', async () => {
  const screen = await render(<div data-testid="x">hello</div>);
  await expect.element(screen.getByTestId('x')).toHaveTextContent('hello');
});
