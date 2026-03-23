with open('App.tsx', 'r') as f:
    lines = f.readlines()

for i in range(270, 290):
    if 'cotStage1, cotStage2' in lines[i]:
        lines[i] = '    cotStage1, setCotStage1, cotStage2, setCotStage2, cotStage3, setCotStage3, cotStage4, setCotStage4, cotStage5, setCotStage5,\n'

start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if "const startChainOfThoughtGeneration = async () => {" in line:
        if i > 300:
            start_idx = i - 1
            break

if start_idx != -1:
    for i in range(start_idx, len(lines)):
        if "const startReview = async () => {" in lines[i]:
            end_idx = i
            break

if start_idx != -1 and end_idx != -1:
    print(f"Deleting from {start_idx} to {end_idx}")
    lines = lines[:start_idx] + lines[end_idx:]

with open('App.tsx', 'w') as f:
    f.writelines(lines)
