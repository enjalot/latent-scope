import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';

// react-element-forge ships a UMD bundle that doesn't load under jsdom; mock
// Button to a plain <button> so the component tree renders.
vi.mock('react-element-forge', () => ({
  Button: ({ text, onClick, disabled, className }) => (
    <button className={className} disabled={disabled} onClick={onClick}>
      {text}
    </button>
  ),
}));

const { default: ExperimentGallery } = await import('./ExperimentGallery.jsx');

const items = [
  { id: 'umap-001', neighbors: 25, min_dist: 0.1, url: 'http://x/umap-001.png' },
  { id: 'umap-002', name: 'My projection', description: 'a nice map', neighbors: 15 },
];

afterEach(cleanup);

describe('ExperimentGallery', () => {
  it('renders a card per item, falling back to id when no name', () => {
    render(<ExperimentGallery items={items} selectedId="umap-001" />);
    expect(screen.getByText('umap-001')).not.toBeNull();
    // named item shows its name plus the id in parens
    expect(screen.getByText('My projection')).not.toBeNull();
    expect(screen.getByText('a nice map')).not.toBeNull();
  });

  it('calls onSelect when an unselected card is clicked', () => {
    const onSelect = vi.fn();
    render(<ExperimentGallery items={items} selectedId="umap-001" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('My projection'));
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it('shows the proceed button only on the selected card', () => {
    const onProceed = vi.fn();
    render(
      <ExperimentGallery
        items={items}
        selectedId="umap-001"
        onProceed={onProceed}
        proceedLabel="Proceed with umap-001"
      />
    );
    const proceed = screen.getByText('Proceed with umap-001');
    fireEvent.click(proceed);
    expect(onProceed).toHaveBeenCalled();
  });

  it('inline-renames through onRename', async () => {
    const onRename = vi.fn().mockResolvedValue({ success: true });
    render(<ExperimentGallery items={items} selectedId="umap-002" onRename={onRename} />);
    // open the editor on the first (unnamed) card
    fireEvent.click(screen.getAllByTitle('Rename / describe')[0]);
    const nameInput = screen.getByPlaceholderText('Name');
    fireEvent.change(nameInput, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByText('Save'));
    expect(onRename).toHaveBeenCalledWith(items[0], {
      name: 'Renamed',
      description: '',
    });
  });

  it('calls onDelete when the delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<ExperimentGallery items={items} selectedId="umap-001" onDelete={onDelete} />);
    fireEvent.click(screen.getAllByText('🗑️')[0]);
    expect(onDelete).toHaveBeenCalledWith(items[0]);
  });
});
