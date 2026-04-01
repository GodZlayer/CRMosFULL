/// <reference types="vite/client" />

declare global {
  interface Window {
    ApexCharts?: any;
    Tabulator?: any;
    Swal?: any;
    bootstrap?: {
      Modal?: new (element: Element) => {
        show(): void;
        hide(): void;
        dispose(): void;
      };
      Offcanvas?: new (element: Element) => {
        show(): void;
        hide(): void;
        dispose(): void;
      };
    };
  }
}

export {};
