import { useState, useEffect, useCallback } from 'react';
import { Button } from 'react-element-forge';
import { apiService } from '../lib/apiService';

import styles from './CustomModels.module.scss';

function CustomEmbeddingModels() {
  const [customModels, setCustomModels] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch existing custom embedding models on component mount
  useEffect(() => {
    apiService.fetchCustomEmbeddingModels().then((models) => setCustomModels(models));
  }, []);

  const handleAddModel = useCallback(async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const form = e.target;
    const data = new FormData(form);
    const newModel = {
      name: data.get('name'),
      url: data.get('url'),
      params: {},
      provider: 'custom_embedding',
    };

    try {
      const updatedModels = await apiService.addCustomEmbeddingModel(newModel);
      setCustomModels(updatedModels);
      form.reset();
    } catch (error) {
      console.error('Failed to add custom embedding model:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const handleDeleteModel = useCallback(
    async (modelId) => {
      try {
        await apiService.deleteCustomEmbeddingModel(modelId);
        setCustomModels(customModels.filter((model) => model.id !== modelId));
      } catch (error) {
        console.error('Failed to delete custom embedding model:', error);
      }
    },
    [customModels]
  );

  return (
    <div className={styles['custom-models']}>
      <div className={styles['custom-models-setup']}>
        <div className={styles['custom-models-form']}>
          <form onSubmit={handleAddModel}>
            <label>
              <span className={styles['form-label']}>Model name: </span>
              <input
                type="text"
                name="name"
                placeholder="all-minilm"
                required
                disabled={isSubmitting}
              />
            </label>

            <label>
              <span className={styles['form-label']}>URL: </span>
              <input
                type="url"
                name="url"
                placeholder="http://localhost:8080/v1"
                required
                disabled={isSubmitting}
              />
            </label>

            <Button type="submit" color="primary" disabled={isSubmitting} text="Add Model" />
          </form>
        </div>

        <div className={styles['custom-models-list']}>
          {customModels.map((model, index) => (
            <div className={styles['item']} key={index}>
              <div className={styles['item-info']}>
                <span className={styles['item-name']}>{model.name}</span>
                <span className={styles['item-url']}>{model.base_url || model.url}</span>
              </div>

              <button
                type="button"
                className={`ls-icon-btn ${styles['item-delete']}`}
                aria-label="Delete model"
                onClick={() => handleDeleteModel(model.id)}
                disabled={isSubmitting}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CustomEmbeddingModels;
