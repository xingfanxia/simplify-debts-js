const tl = gsap.timeline();

const entries = [];
let groupEntryAdded = false;

let roundToInteger = false;

function addDebtEntry() {
    const entryDiv = document.createElement('div');
    entryDiv.className = 'grid grid-cols-12 gap-2 items-center mb-2 p-2 bg-gray-100 rounded-lg opacity-0';
    entryDiv.innerHTML = `
        <input type="text" value="Everyone" placeholder="Who owes (comma-separated)" class="col-span-4 sm:col-span-3 p-2 border rounded text-sm">
        <span class="col-span-2 sm:col-span-1 text-sm text-gray-600 text-center">owes</span>
        <input type="text" placeholder="Who pays" class="col-span-6 sm:col-span-3 p-2 border rounded text-sm">
        <span class="col-span-2 sm:col-span-1 text-sm text-gray-600 text-center">of</span>
        <input type="number" step="0.01" placeholder="Amount" class="col-span-7 sm:col-span-2 p-2 border rounded text-sm">
        <button class="col-span-5 sm:col-span-2 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm">Remove</button>
    `;
    
    // Insert the new debt entry before the group entry if it exists
    const entriesContainer = document.getElementById('entries');
    const groupEntry = entriesContainer.querySelector('.group-entry');
    if (groupEntry) {
        entriesContainer.insertBefore(entryDiv, groupEntry);
    } else {
        entriesContainer.appendChild(entryDiv);
    }

    // Animate the entry popping in
    gsap.fromTo(entryDiv, 
        {opacity: 0, scale: 0.8, y: -20}, 
        {opacity: 1, scale: 1, y: 0, duration: 0.3, ease: "back.out(1.7)"}
    );

    const whoOwesInput = entryDiv.querySelector('input');
    whoOwesInput.addEventListener('input', function() {
        const inputValue = this.value.trim().toLowerCase();
        if (inputValue === '*') {
            this.value = 'Everyone';
        } else {
            // Allow comma-separated names
            this.value = inputValue.split(',').map(name => name.trim()).join(', ');
        }
    });

    entryDiv.querySelector('button').addEventListener('click', () => {
        // Animate the entry popping out
        gsap.to(entryDiv, {
            opacity: 0, 
            scale: 0.8, 
            y: -20, 
            duration: 0.3, 
            ease: "back.in(1.7)",
            onComplete: () => entryDiv.remove()
        });
    });
}

function addGroupEntry() {
    if (groupEntryAdded) {
        alert("You can only add one 'Rest of Group' entry.");
        return;
    }

    const entryDiv = document.createElement('div');
    entryDiv.className = 'grid grid-cols-12 gap-2 items-center mb-2 p-2 bg-green-100 rounded-lg opacity-0 group-entry';
    entryDiv.innerHTML = `
        <input type="text" placeholder="Enter names, separated by commas" class="col-span-12 sm:col-span-10 p-2 border rounded text-sm">
        <button class="col-span-12 sm:col-span-2 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm mt-2 sm:mt-0">Remove</button>
    `;
    
    document.getElementById('entries').appendChild(entryDiv);

    // Animate the entry popping in
    gsap.fromTo(entryDiv, 
        {opacity: 0, scale: 0.8, y: -20}, 
        {opacity: 1, scale: 1, y: 0, duration: 0.3, ease: "back.out(1.7)"}
    );

    entryDiv.querySelector('button').addEventListener('click', () => {
        // Animate the entry popping out
        gsap.to(entryDiv, {
            opacity: 0, 
            scale: 0.8, 
            y: -20, 
            duration: 0.3, 
            ease: "back.in(1.7)",
            onComplete: () => {
                entryDiv.remove();
                groupEntryAdded = false;
            }
        });
    });

    groupEntryAdded = true;
}

function compileEntries() {
    let result = '';
    const debtGraph = {};
    const participants = new Set();

    document.querySelectorAll('#entries > div').forEach(entry => {
        const inputs = entry.querySelectorAll('input');
        if (inputs.length === 3) {
            // Debt relationship
            const [debtors, debtee, amount] = inputs;
            if (debtee.value && amount.value) {
                const debtorList = debtors.value.trim().toLowerCase() === 'everyone' ? ['*'] : debtors.value.split(',').map(d => d.trim()).filter(d => d !== '');
                
                // If debtorList is empty, it means someone is paying for themselves
                if (debtorList.length === 0) {
                    participants.add(debtee.value);
                } else {
                    debtorList.forEach(debtor => {
                        if (!debtGraph[debtor]) {
                            debtGraph[debtor] = {};
                        }
                        debtGraph[debtor][debtee.value] = (debtGraph[debtor][debtee.value] || 0) + parseFloat(amount.value) / debtorList.length;
                        participants.add(debtee.value);
                        if (debtor !== '*') participants.add(debtor);
                    });
                }
            }
        } else if (inputs.length === 1) {
            // Group entry
            const [groupInput] = inputs;
            if (groupInput.value) {
                const names = groupInput.value.split(',').map(name => name.trim());
                names.forEach(name => {
                    if (name) {
                        participants.add(name);
                    }
                });
            }
        }
    });

    // Compile the graph into the required format
    for (const [debtor, debts] of Object.entries(debtGraph)) {
        for (const [debtee, amount] of Object.entries(debts)) {
            result += `${debtor} -> ${debtee}: ${amount.toFixed(2)}\n`;
        }
    }

    // Add participants who don't have specific debts
    participants.forEach(participant => {
        if (!debtGraph[participant] && !Object.values(debtGraph).some(debts => debts[participant])) {
            result += `${participant}\n`;
        }
    });

    return result;
}

function updateRoundToInteger() {
    roundToInteger = document.getElementById('roundToInteger').checked;
}

document.getElementById('addDebtBtn').addEventListener('click', addDebtEntry);
document.getElementById('addGroupBtn').addEventListener('click', function() {
    addGroupEntry();
    this.disabled = groupEntryAdded;
    this.classList.toggle('opacity-50', groupEntryAdded);
});

document.addEventListener('DOMContentLoaded', function() {
    const graphSection = document.getElementById('graphSection');
    graphSection.style.display = 'none'; // Hide initially

    document.getElementById('submitBtn').addEventListener('click', async (e) => {
        e.preventDefault();
        const input = compileEntries();
        const result = document.getElementById('result');
        result.innerHTML = 'Processing...';
        graphSection.style.display = 'block'; // Show the graph section

        try {
            const response = await fetch('/parse', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ input, roundToInteger }),
            });

            const data = await response.json();

            if (response.ok) {
                result.innerHTML = data.svg;
                
                // Animate the dot graph appearing
                const svgElement = result.querySelector('svg');
                if (svgElement) {
                    gsap.fromTo(svgElement, 
                        {opacity: 0, scale: 0.9}, 
                        {opacity: 1, scale: 1, duration: 0.5, ease: "power2.out"}
                    );
                }
            } else {
                result.innerHTML = `<p class="text-red-500">${data.errors || data.error}</p>`;
            }
        } catch (error) {
            result.innerHTML = `<p class="text-red-500">An error occurred: ${error.message}</p>`;
        }
    });

    // Add this event listener at the end of the file
    document.getElementById('roundToInteger').addEventListener('change', updateRoundToInteger);
});

// Initial animation for the form
gsap.from("#debtForm", {duration: 1, opacity: 0, y: 20, ease: "power3.out"});