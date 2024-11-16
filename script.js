const API_URL = 'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1';
const API_KEY = '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';
const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const clearChatButton = document.getElementById('clear-chat');

let conversationHistory = [];
let isProcessing = false;

marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
});

async function queryAPI(data) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(API_URL, {
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify(data),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Erro na requisição: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('A requisição excedeu o tempo limite.');
        }
        console.error('Erro ao chamar a API:', error);
        throw error;
    }
}

function addMessage(messageContent, isUser) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    if (isUser) {
        messageElement.textContent = messageContent;
    } else {
        messageElement.innerHTML = messageContent;
    }
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addTypingIndicator() {
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = `
        <div class="loader"></div>
        <div class="loader"></div>
        <div class="loader"></div>
    `;
    messagesContainer.appendChild(typingIndicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return typingIndicator;
}

function removeElement(element) {
    if (element) messagesContainer.removeChild(element);
}

function buildPrompt() {
    const maxHistoryLength = 10;
    const promptHistory = conversationHistory.slice(-maxHistoryLength);
    
    let prompt = `<s>[INST] Você é um assistente virtual profissional e prestativo. Siga estas diretrizes:

1. Forneça respostas claras, precisas e relevantes
2. Mantenha um tom profissional e amigável
3. Se não souber algo, admita honestamente
4. Evite respostas vagas ou evasivas
5. Use exemplos quando apropriado
6. Mantenha as respostas concisas e diretas

Contexto atual: ${promptHistory.length} mensagens anteriores na conversa.
[/INST]</s>`;

    promptHistory.forEach(msg => {
        if (msg.role === 'user') {
            prompt += `<s>[INST] ${msg.content} [/INST]</s>`;
        } else {
            prompt += `<s>${msg.content}</s>`;
        }
    });

    prompt += `<s>[INST] ${userInput.value.trim()} [/INST]`;
    return prompt;
}

function cleanResponse(response) {
    return response.trim().replace(/<\/?s>/g, '');
}

async function processBotResponse(typingIndicator) {
    if (isProcessing) return;
    isProcessing = true;

    const requestData = {
        inputs: buildPrompt(),
        parameters: {
            max_new_tokens: 1024,
            temperature: 0.7,
            top_p: 0.95,
            repetition_penalty: 1.15,
            do_sample: true,
            return_full_text: false
        }
    };

    try {
        const botResponse = await queryAPI(requestData);
        let botMessage = 'Desculpe, não consegui gerar uma resposta.';

        if (botResponse?.generated_text) {
            botMessage = cleanResponse(botResponse.generated_text);
        } else if (botResponse?.[0]?.generated_text) {
            botMessage = cleanResponse(botResponse[0].generated_text);
        }

        botMessage = botMessage.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
            return `\n\`\`\`${lang || ''}\n${code.trim()}\n\`\`\`\n`;
        });
        
        botMessage = marked.parse(botMessage);

        conversationHistory.push({ role: 'assistant', content: botMessage });
        saveConversationHistory();
        removeElement(typingIndicator);
        addMessage(botMessage, false);
    } catch (error) {
        addMessage(`Desculpe, ocorreu um erro: ${error.message}`, false);
        removeElement(typingIndicator);
    } finally {
        sendButton.disabled = false;
        userInput.focus();
        isProcessing = false;
    }
}

function handleUserInput() {
    const userMessage = userInput.value.trim();
    if (userMessage === '') return;

    conversationHistory.push({ role: 'user', content: userMessage });
    saveConversationHistory();
    addMessage(userMessage, true);
    userInput.value = '';

    const typingIndicator = addTypingIndicator();
    sendButton.disabled = true;

    processBotResponse(typingIndicator);
}

function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

const debouncedHandleUserInput = debounce(handleUserInput, 300);

function encryptData(data) {
    return btoa(JSON.stringify(data));
}

function decryptData(data) {
    return JSON.parse(atob(data));
}

function saveConversationHistory() {
    try {
        const encryptedData = encryptData(conversationHistory);
        localStorage.setItem('conversationHistory', encryptedData);
    } catch (error) {
        console.error('Erro ao salvar histórico de conversa:', error);
    }
}

function loadConversationHistory() {
    try {
        const storedHistory = localStorage.getItem('conversationHistory');
        if (storedHistory) {
            conversationHistory = decryptData(storedHistory);
            conversationHistory.forEach(msg => addMessage(msg.content, msg.role === 'user'));
        }
    } catch (error) {
        console.error('Erro ao carregar histórico de conversa:', error);
    }
}

// Event Listeners
sendButton.addEventListener('click', debouncedHandleUserInput);

userInput.addEventListener('input', () => {
    sendButton.disabled = userInput.value.trim() === '';
});

userInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !sendButton.disabled) {
        debouncedHandleUserInput();
    }
});

clearChatButton.addEventListener('click', () => {
    if (confirm('Tem certeza de que deseja reiniciar o chat? Isso apagará todo o histórico.')) {
        conversationHistory = [];
        localStorage.removeItem('conversationHistory');
        messagesContainer.innerHTML = '';
    }
});

// Inicialização
loadConversationHistory();
userInput.focus(); 