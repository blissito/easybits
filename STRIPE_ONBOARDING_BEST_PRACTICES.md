# Stripe Connect Onboarding - Mejores Prácticas

## Problema Resuelto

Cuando un usuario completa el onboarding de Stripe Connect embebido en la aplicación, al refrescar la página se volvía a mostrar el formulario de onboarding. Esto ocurría porque no se verificaba el estado de las capacidades de la cuenta antes de mostrar el componente.

## Solución Implementada

### 1. Verificación del Estado de la Cuenta

**Antes:**

```typescript
// El onboarding se mostraba siempre sin verificar el estado
{
  stripeConnectInstance && (
    <ConnectAccountOnboarding onExit={handleOnboardingExit} />
  );
}
```

**Después:**

```typescript
// Solo se muestra si el onboarding no está completo
{
  stripeConnectInstance && !onboardingCompleted && (
    <ConnectAccountOnboarding onExit={handleOnboardingExit} />
  );
}
```

### 2. Función Mejorada para Verificar el Estado

```typescript
export const getAccountStatus = async (
  accountId?: string,
  isDev: boolean = false
): Promise<{
  capabilities: Capabilities | null;
  requirements: any;
  isOnboardingComplete: boolean;
} | null> => {
  // Verifica capacidades y requisitos de la cuenta
  const capabilities = data.configuration?.merchant?.capabilities;
  const requirements = data.requirements;

  // Determina si el onboarding está completo
  const isOnboardingComplete = capabilities?.card_payments?.status === "active";

  return { capabilities, requirements, isOnboardingComplete };
};
```

### 3. Verificación Automática del Estado

```typescript
// Verificar el estado al cargar la página
useEffect(() => {
  if (user.stripeId) {
    capabilitiesFetcher.submit(
      { intent: "get_account_payments" },
      { method: "post", action: "/api/v1/stripe/account" }
    );
  }
}, [user.stripeId]);

// Actualizar estado cuando se reciben los datos
useEffect(() => {
  if (capabilitiesFetcher.data) {
    const { isOnboardingComplete } = capabilitiesFetcher.data;
    setOnboardingCompleted(isOnboardingComplete || false);
  }
}, [capabilitiesFetcher.data]);
```

### 4. Refrescar Estado al Salir del Onboarding

```typescript
const handleOnboardingExit = () => {
  console.log("The account has exited onboarding");
  // Refrescar las capacidades para verificar si el onboarding se completó
  if (user.stripeId) {
    capabilitiesFetcher.submit(
      { intent: "get_account_payments" },
      { method: "post", action: "/api/v1/stripe/account" }
    );
  }
};
```

### 5. Notificación de Éxito

```typescript
// Mostrar notificación cuando se completa el onboarding
useEffect(() => {
  if (capabilitiesFetcher.data) {
    const { isOnboardingComplete } = capabilitiesFetcher.data;
    const wasCompleted = onboardingCompleted;
    const isNowCompleted = isOnboardingComplete || false;

    setOnboardingCompleted(isNowCompleted);

    // Mostrar notificación si el onboarding se acaba de completar
    if (!wasCompleted && isNowCompleted) {
      setShowOnboardingSuccess(true);
      setTimeout(() => setShowOnboardingSuccess(false), 5000);
    }
  }
}, [capabilitiesFetcher.data, onboardingCompleted]);
```

## Mejores Prácticas de Stripe Connect

### 1. Verificar Capacidades de la Cuenta

**Recomendado:** Usar el campo `capabilities.card_payments.status` para determinar si el onboarding está completo.

```typescript
const isOnboardingComplete = capabilities?.card_payments?.status === "active";
```

### 2. Verificar Requisitos de la Cuenta

**Opcional:** Usar el campo `requirements` para obtener información detallada sobre qué falta por completar.

```typescript
const requirements = data.requirements;
// requirements puede contener información sobre documentos faltantes, etc.
```

### 3. Usar Webhooks para Actualizaciones en Tiempo Real

**Recomendado:** Configurar webhooks para detectar cambios en el estado de la cuenta.

```typescript
// En el webhook handler
if (event.type === "account.updated") {
  const account = event.data.object;
  // Actualizar el estado de la cuenta en tu base de datos
}
```

### 4. Manejar Estados de Carga

**Importante:** Mostrar estados de carga mientras se verifica el estado de la cuenta.

```typescript
const isLoading = capabilitiesFetcher.state !== "idle";

if (isLoading) {
  return <Spinner />;
}
```

### 5. Proporcionar Feedback Visual

**UX:** Mostrar claramente el estado actual de la cuenta.

```typescript
const ConectStripeButton = ({ onboardingCompleted, ...props }) => {
  if (onboardingCompleted) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-green-100 border-2 border-green-500 rounded-lg">
        <FaStripeS className="text-green-600" />
        <span className="text-green-800 font-medium">Cuenta Stripe activa</span>
      </div>
    );
  }

  return <BrutalButton {...props}>Conecta tu cuenta Stripe</BrutalButton>;
};
```

## Estados de Onboarding

### Estados de Capacidades

- **`inactive`**: La capacidad no está habilitada, se requiere onboarding
- **`active`**: La capacidad está habilitada, el onboarding está completo
- **`pending`**: La capacidad está en proceso de verificación

### Estados de Requisitos

- **`currently_due`**: Información requerida actualmente
- **`eventually_due`**: Información que será requerida en el futuro
- **`past_due`**: Información que estaba requerida pero no se proporcionó

## Consideraciones de Seguridad

1. **Nunca almacenes información sensible** del onboarding en tu base de datos
2. **Usa siempre HTTPS** para todas las comunicaciones con Stripe
3. **Verifica las firmas de webhooks** para asegurar que vienen de Stripe
4. **Implementa rate limiting** en tus endpoints de webhook

## Monitoreo y Logging

```typescript
// Log de eventos importantes
console.info(`Account ${accountId} updated for user ${user.email}`);

// Log de errores
console.error("Error fetching account status:", error);
```

## Recursos Adicionales

- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Account Onboarding Guide](https://stripe.com/docs/connect/account-onboarding)
- [Webhook Events Reference](https://stripe.com/docs/api/events)
- [Account Capabilities](https://stripe.com/docs/connect/account-capabilities)
