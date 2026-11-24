// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RolagemArrastavel } from './RolagemArrastavel';

afterEach(cleanup);

function montar() {
  const aoClicar = vi.fn();
  render(
    <RolagemArrastavel como="ul" aria-label="faixa">
      <li>
        <button type="button" onClick={aoClicar}>
          chip
        </button>
      </li>
    </RolagemArrastavel>,
  );
  const faixa = screen.getByLabelText('faixa');
  faixa.setPointerCapture = vi.fn();
  return { faixa, chip: screen.getByText('chip'), aoClicar };
}

const mouse = { pointerType: 'mouse', button: 0 };

describe('rolagem arrastável', () => {
  it('arrastar com o mouse rola a faixa e não clica no chip', () => {
    const { faixa, chip, aoClicar } = montar();
    faixa.scrollLeft = 100;
    fireEvent.pointerDown(chip, { ...mouse, clientX: 300 });
    fireEvent.pointerMove(faixa, { ...mouse, clientX: 240 });
    expect(faixa.scrollLeft).toBe(160);
    fireEvent.pointerUp(faixa, mouse);
    fireEvent.click(chip);
    expect(aoClicar).not.toHaveBeenCalled();
  });

  it('um clique sem arrastar chega ao chip', () => {
    const { faixa, chip, aoClicar } = montar();
    fireEvent.pointerDown(chip, { ...mouse, clientX: 300 });
    fireEvent.pointerMove(faixa, { ...mouse, clientX: 302 });
    fireEvent.pointerUp(faixa, mouse);
    fireEvent.click(chip);
    expect(aoClicar).toHaveBeenCalledOnce();
  });
});
