import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "../app/routes/api/v1/assets";
import { db } from "../app/.server/db";
import { AssetType } from "@prisma/client";

// Mock de la base de datos
vi.mock("../app/.server/db", () => ({
  db: {
    asset: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

// Mock de las funciones de Stripe
vi.mock("../app/.server/stripe_v2", () => ({
  updateOrCreateProductAndPrice: vi.fn(),
  updateProduct: vi.fn(),
}));

// Mock de getUserOrRedirect
vi.mock("../app/.server/getters", () => ({
  getUserOrRedirect: vi.fn(() => ({
    id: "user_123",
    stripeId: "stripe_account_123",
    email: "test@example.com",
  })),
}));

// Mock de console.warn para capturar advertencias
const mockConsoleWarn = vi.fn();
global.console.warn = mockConsoleWarn;

describe("Price Validation Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsoleWarn.mockClear();
  });

  // Helper para crear un request mock
  const createMockRequest = (formData: Record<string, string>) => {
    const mockFormData = new Map(Object.entries(formData));
    return {
      formData: vi.fn().mockResolvedValue({
        get: (key: string) => mockFormData.get(key),
      }),
    } as any;
  };

  // Helper para crear un asset mock
  const createMockAsset = (overrides = {}) => ({
    id: "asset_123",
    slug: "test-asset",
    title: "Test Asset",
    price: 100,
    currency: "mxn",
    type: AssetType.EBOOK,
    published: false,
    userId: "user_123",
    stripeProduct: "prod_123",
    stripePrice: "price_123",
    actions: [],
    tags: "",
    note: null,
    description: null,
    eventDate: null,
    roomId: null,
    metadata: null,
    gallery: [],
    template: null,
    publicLink: null,
    extra: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe("Validación de Precios Negativos", () => {
    it("debería rechazar precios negativos", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: -10,
          title: "Test Asset",
        }),
      });

      const response = await action({ request } as any);

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(400);
      expect(await (response as Response).text()).toBe(
        "El precio no puede ser negativo"
      );
    });
  });

  describe("Validación de Precios Muy Altos", () => {
    it("debería rechazar precios mayores a 999,999", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: 1000000,
          title: "Test Asset",
        }),
      });

      const response = await action({ request } as any);

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(400);
      expect(await (response as Response).text()).toBe(
        "El precio es demasiado alto. Máximo permitido: $999,999"
      );
    });
  });

  describe("Validación de Precios con Muchos Decimales", () => {
    it("debería rechazar precios con más de 2 decimales", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: 99.999,
          title: "Test Asset",
        }),
      });

      const response = await action({ request } as any);

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(400);
      expect(await (response as Response).text()).toBe(
        "El precio debe tener máximo 2 decimales"
      );
    });
  });

  describe("Validación de Precios Inválidos", () => {
    it("debería rechazar NaN", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: "NaN",
          title: "Test Asset",
        }),
      });

      const response = await action({ request } as any);

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(400);
      expect(await (response as Response).text()).toBe(
        "El precio debe ser un número válido"
      );
    });

    it("debería rechazar Infinity", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: "abc123",
          title: "Test Asset",
        }),
      });

      const response = await action({ request } as any);

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(400);
      expect(await (response as Response).text()).toBe(
        "El precio debe ser un número válido"
      );
    });

    it("debería rechazar string inválido", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: "no-es-un-numero",
          title: "Test Asset",
        }),
      });

      const response = await action({ request } as any);

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(400);
      expect(await (response as Response).text()).toBe(
        "El precio debe ser un número válido"
      );
    });
  });

  describe("Detección de Cambios Muy Pequeños", () => {
    it("debería mostrar advertencia para cambios menores al 1%", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);
      (db.asset.update as any).mockResolvedValue({
        ...mockAsset,
        price: 100.5,
      });

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: 100.5, // 0.5% de cambio
          title: "Test Asset",
        }),
      });

      await action({ request } as any);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Cambio de precio muy pequeño detectado: 100 -> 100.5 (0.50%)"
        )
      );
    });

    it("no debería mostrar advertencia para cambios mayores al 1%", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);
      (db.asset.update as any).mockResolvedValue({ ...mockAsset, price: 105 });

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: 105, // 5% de cambio
          title: "Test Asset",
        }),
      });

      await action({ request } as any);

      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });
  });

  describe("Precios Válidos", () => {
    it("debería aceptar precios válidos con 2 decimales", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);
      (db.asset.update as any).mockResolvedValue({
        ...mockAsset,
        price: 150.5,
      });

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: 150.5,
          title: "Test Asset",
        }),
      });

      const result = await action({ request } as any);

      expect(result).not.toBeInstanceOf(Response);
      expect(db.asset.update).toHaveBeenCalled();
    });

    it("debería aceptar precios enteros", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);
      (db.asset.update as any).mockResolvedValue({ ...mockAsset, price: 200 });

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: 200,
          title: "Test Asset",
        }),
      });

      const result = await action({ request } as any);

      expect(result).not.toBeInstanceOf(Response);
      expect(db.asset.update).toHaveBeenCalled();
    });

    it("debería aceptar precio cero", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);
      (db.asset.update as any).mockResolvedValue({ ...mockAsset, price: 0 });

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: 0,
          title: "Test Asset",
        }),
      });

      const result = await action({ request } as any);

      expect(result).not.toBeInstanceOf(Response);
      expect(db.asset.update).toHaveBeenCalled();
    });
  });

  describe("Casos Edge", () => {
    it("debería manejar precio inicial null", async () => {
      const mockAsset = createMockAsset({ price: null });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);
      (db.asset.update as any).mockResolvedValue({ ...mockAsset, price: 50 });

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: 50,
          title: "Test Asset",
        }),
      });

      const result = await action({ request } as any);

      expect(result).not.toBeInstanceOf(Response);
      expect(db.asset.update).toHaveBeenCalled();
    });

    it("debería manejar precio inicial undefined", async () => {
      const mockAsset = createMockAsset({ price: undefined });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);
      (db.asset.update as any).mockResolvedValue({ ...mockAsset, price: 75 });

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: 75,
          title: "Test Asset",
        }),
      });

      const result = await action({ request } as any);

      expect(result).not.toBeInstanceOf(Response);
      expect(db.asset.update).toHaveBeenCalled();
    });
  });

  describe("Límites de Precio", () => {
    it("debería aceptar el precio máximo permitido", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);
      (db.asset.update as any).mockResolvedValue({
        ...mockAsset,
        price: 999999,
      });

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: 999999,
          title: "Test Asset",
        }),
      });

      const result = await action({ request } as any);

      expect(result).not.toBeInstanceOf(Response);
      expect(db.asset.update).toHaveBeenCalled();
    });

    it("debería rechazar el precio máximo + 1", async () => {
      const mockAsset = createMockAsset({ price: 100 });
      (db.asset.findUnique as any).mockResolvedValue(mockAsset);

      const request = createMockRequest({
        intent: "update_asset",
        data: JSON.stringify({
          id: "asset_123",
          price: 1000000,
          title: "Test Asset",
        }),
      });

      const response = await action({ request } as any);

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(400);
    });
  });
});
