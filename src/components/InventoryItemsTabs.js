import React, { useState, useEffect } from 'react';
import InventoryItemsPage from './InventoryItemsPage';
import WebsiteItemsPage from './WebsiteItemsPage';
import './InventoryItemsTabs.css';

const TAB_INVENTORY_ITEMS = 'inventory-items';
const TAB_WEBSITE_ITEMS = 'website-items';

const InventoryItemsTabs = ({ defaultTab = TAB_INVENTORY_ITEMS }) => {
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  return (
    <div className="page-container page-container--full inventory-items-tabs-page">
      <header className="page-header inventory-items-tabs-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Manage stock items and website catalog</p>
        </div>
      </header>
      <div className="tab-nav tab-nav--underline inventory-items-tab-list" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === TAB_INVENTORY_ITEMS}
          aria-controls="panel-inventory-items"
          id="tab-inventory-items"
          className={`tab-nav__item inventory-items-tab ${activeTab === TAB_INVENTORY_ITEMS ? 'tab-nav__item--active active' : ''}`}
          onClick={() => setActiveTab(TAB_INVENTORY_ITEMS)}
        >
          Inventory items
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === TAB_WEBSITE_ITEMS}
          aria-controls="panel-website-items"
          id="tab-website-items"
          className={`tab-nav__item inventory-items-tab ${activeTab === TAB_WEBSITE_ITEMS ? 'tab-nav__item--active active' : ''}`}
          onClick={() => setActiveTab(TAB_WEBSITE_ITEMS)}
        >
          Website items
        </button>
      </div>
      <div
        id="panel-inventory-items"
        role="tabpanel"
        aria-labelledby="tab-inventory-items"
        className="section-card inventory-items-panel"
        hidden={activeTab !== TAB_INVENTORY_ITEMS}
      >
        {activeTab === TAB_INVENTORY_ITEMS && <InventoryItemsPage />}
      </div>
      <div
        id="panel-website-items"
        role="tabpanel"
        aria-labelledby="tab-website-items"
        className="section-card inventory-items-panel"
        hidden={activeTab !== TAB_WEBSITE_ITEMS}
      >
        {activeTab === TAB_WEBSITE_ITEMS && <WebsiteItemsPage />}
      </div>
    </div>
  );
};

export default InventoryItemsTabs;
