// © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
export const getPrompts = async (onSuccess) => {
  fetch("/api/prompts", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }).then((response) => {
    response.json().then((data) => {
      const formattedForDropdown = data
        .filter((item) => {
          return item.identifier !== "journey-to-stories-d6de9661d893";
        })
        .map((item) => ({
          ...item,
          value: item.identifier,
          label: item.title,
          followUps: item.follow_ups,
        }));
      onSuccess(formattedForDropdown);
    });
  });
};

export const getModels = async (onSuccess) => {
  fetch("/api/models", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }).then((response) => {
    response.json().then((data) => {
      onSuccess(data);
    });
  });
};

export const getContextSnippets = async (onSuccess) => {
  fetch("/api/knowledge/snippets", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }).then((response) => {
    response.json().then((data) => {
      onSuccess(data);
    });
  });
};

export const getDocuments = async (onSuccess) => {
  fetch("/api/knowledge/documents", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }).then((response) => {
    response.json().then((data) => {
      const formattedForDropdown = data.map((item) => ({
        ...item,
        value: item.key,
        label: item.title,
      }));
      onSuccess(formattedForDropdown);
    });
  });
};

export const getRenderedPrompt = async (body, onSuccess) => {
  fetch("/api/prompt/render", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then((response) => {
    response.json().then((data) => {
      onSuccess(data);
    });
  });
};

export const getDisclaimerAndGuidelines = async (onSuccess) => {
  fetch("/api/disclaimer-guidelines", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }).then((response) => {
    response.json().then((data) => {
      if (data.enabled) {
        onSuccess(data);
      } else {
        onSuccess(null);
      }
    });
  });
};

export const getInspirations = async (onSuccess) => {
  fetch("/api/inspirations", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }).then((response) => {
    response.json().then((data) => {
      onSuccess(data);
    });
  });
};

export const getInspirationById = async (inspirationId, onSuccess) => {
  fetch(`/api/inspirations/${inspirationId}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }).then((response) => {
    if (!response.ok) {
      throw new Error("Failed to fetch inspiration");
    }
    response.json().then((data) => {
      onSuccess(data);
    });
  });
};

export const getRules = async (onSuccess) =>
  fetch("/api/rules/list", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }).then((response) => {
    response.json().then((data) => {
      onSuccess(data.rules || []);
    });
  });

// API Key Management Functions
export const getApiKeys = async (onSuccess, onError) => {
  const response = await fetch("/api/apikeys", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = new Error(`HTTP error! status: ${response.status}`);
    if (onError) {
      onError(error);
    } else {
      console.error("Error fetching API keys:", error);
    }
    return;
  }

  const data = await response.json();
  onSuccess(data);
};

export const generateApiKey = async (
  name,
  onSuccess,
  onError,
  expiresDays = 30,
) => {
  const response = await fetch("/api/apikeys/generate", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: name,
      expires_days: expiresDays,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(
      errorData.detail || `HTTP error! status: ${response.status}`,
    );
    if (onError) {
      onError(error);
    } else {
      console.error("Error generating API key:", error);
    }
    return;
  }

  const data = await response.json();
  onSuccess(data);
};

export const revokeApiKey = async (keyHash, onSuccess, onError) => {
  const response = await fetch("/api/apikeys/revoke", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key_hash: keyHash,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(
      errorData.detail || `HTTP error! status: ${response.status}`,
    );
    if (onError) {
      onError(error);
    } else {
      console.error("Error revoking API key:", error);
    }
    return;
  }

  const data = await response.json();
  onSuccess(data);
};

export const getApiKeyUsage = async (onSuccess, onError) => {
  const response = await fetch("/api/apikeys/usage", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();
  onSuccess(data);
};

export const getPocStatus = async (onSuccess, onError) => {
  try {
    const response = await fetch("/api/poc/status", {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (onSuccess) onSuccess(data);
    return data;
  } catch (error) {
    if (onError) onError(error);
  }
};

export const executePocSpike = async (payload, onSuccess, onError) => {
  try {
    const response = await fetch("/api/poc/execute", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (onSuccess) onSuccess(data);
    return data;
  } catch (error) {
    if (onError) onError(error);
  }
};

export const executePocSpikeStream = async (payload, onChunk, onFinish, onError) => {
  try {
    const response = await fetch("/api/poc/execute?stream=true", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line.trim());
          if (item.type === "log") {
            onChunk(item.message);
          } else if (item.type === "result") {
            onFinish(item.data);
          } else if (item.type === "error") {
            onError(new Error(item.message));
          }
        } catch (e) {
          onChunk(line);
        }
      }
    }
  } catch (error) {
    if (onError) onError(error);
  }
};

export const stopPocPreview = async (sandboxId, onSuccess, onError) => {
  try {
    const response = await fetch(`/api/poc/preview/${sandboxId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (onSuccess) onSuccess(data);
    return data;
  } catch (error) {
    if (onError) onError(error);
  }
};
