import re
from typing import Dict, List, Tuple, Union

def convert_cpp_to_python(code: str) -> Dict[str, Union[str, List[str]]]:
    """
    Convert C++ code to Python code.

    @args: code: str - C++ code as a string
    @returns: Dict with full string and per-line list
    """
    lines = code.split('\n')
    result = []
    indent_level = 0
    
    for line in lines:
        stripped = line.strip()
        
        if not stripped or stripped.startswith('//'):
            result.append(line)
            continue
        
        if stripped.startswith('class Solution'):
            result.append('class Solution:')
            indent_level = 1
            continue
        
        if stripped in ['{', 'public:', 'private:', 'protected:']:
            continue
        
        if stripped == '};':
            indent_level = max(0, indent_level - 1)
            continue
        
        if stripped == '}':
            indent_level = max(0, indent_level - 1)
            continue
        
        converted = convert_line(stripped)
        
        if converted.endswith(':'):
            result.append('    ' * indent_level + converted)
            indent_level += 1
        elif stripped.startswith('}'):
            indent_level = max(0, indent_level - 1)
            if converted:
                result.append('    ' * indent_level + converted)
        else:
            if converted:
                result.append('    ' * indent_level + converted)
                if converted.rstrip().endswith(':'):
                    indent_level += 1
    
    python_code = '\n'.join(result)
    python_code = cleanup_code(python_code)
    python_lines = python_code.split('\n') if python_code else []
    
    return {
        "python": python_code,
        "lines": python_lines,
    }

def convert_line(line: str) -> str:
    """Convert a single line of C++ to Python."""
    line = line.strip()
    
    if not line or line == '{' or line == '}' or line == '};':
        return ''
    
    if line in ['public:', 'private:', 'protected:']:
        return ''
    
    method_match = re.match(r'(\w+(?:<[^>]+>)?)\s+(\w+)\s*\((.*?)\)\s*\{?', line)
    if method_match:
        return_type, method_name, params = method_match.groups()
        python_params = convert_parameters(params)
        
        return_hint = convert_type_to_python_hint(return_type)
        if python_params:
            return f'def {method_name}({python_params}) -> {return_hint}:'
        else:
            return f'def {method_name}(self) -> {return_hint}:'
    
    line = re.sub(r'\bvector<([^>]+)>', lambda m: f'List[{convert_type_to_python_hint(m.group(1))}]', line)
    line = re.sub(r'\bunordered_map<([^,]+),\s*([^>]+)>', lambda m: f'Dict[{convert_type_to_python_hint(m.group(1))}, {convert_type_to_python_hint(m.group(2))}]', line)
    line = re.sub(r'\bmap<([^,]+),\s*([^>]+)>', lambda m: f'Dict[{convert_type_to_python_hint(m.group(1))}, {convert_type_to_python_hint(m.group(2))}]', line)
    line = re.sub(r'\bunordered_set<([^>]+)>', lambda m: f'Set[{convert_type_to_python_hint(m.group(1))}]', line)
    line = re.sub(r'\bset<([^>]+)>', lambda m: f'Set[{convert_type_to_python_hint(m.group(1))}]', line)
    
    for_match = re.match(r'for\s*\(\s*(\w+)\s+(\w+)\s*=\s*([^;]+);\s*\2\s*(<|<=|>|>=|!=)\s*([^;]+);\s*(\2\+\+|\+\+\2|\2--|\-\-\2|\2\s*[\+\-]=\s*\d+)\s*\)\s*\{?', line)
    if for_match:
        var_type, var_name, start, op, end, increment = for_match.groups()
        
        if '++' in increment or '+=' in increment:
            if '<' in op:
                return f'for {var_name} in range({start}, {end}):'
            elif '<=' in op:
                return f'for {var_name} in range({start}, {end} + 1):'
        elif '--' in increment or '-=' in increment:
            if '>' in op:
                return f'for {var_name} in range({start}, {end}, -1):'
            elif '>=' in op:
                return f'for {var_name} in range({start}, {end} - 1, -1):'
        
        return f'for {var_name} in range({start}, {end}):'
    
    range_for_match = re.match(r'for\s*\(\s*(?:auto|const auto|auto&|const auto&|int|char|string)\s+(\w+)\s*:\s*([^)]+)\)\s*\{?', line)
    if range_for_match:
        var_name, container = range_for_match.groups()
        return f'for {var_name} in {container.strip()}:'
    
    if_match = re.match(r'if\s*\((.*?)\)\s*\{?', line)
    if if_match:
        condition = convert_condition(if_match.group(1))
        return f'if {condition}:'
    
    elif_match = re.match(r'else\s+if\s*\((.*?)\)\s*\{?', line)
    if elif_match:
        condition = convert_condition(elif_match.group(1))
        return f'elif {condition}:'
    
    if re.match(r'else\s*\{?', line):
        return 'else:'
    
    while_match = re.match(r'while\s*\((.*?)\)\s*\{?', line)
    if while_match:
        condition = convert_condition(while_match.group(1))
        return f'while {condition}:'
    
    var_decl_match = re.match(r'(\w+(?:<[^>]+>)?)\s+(\w+)\s*=\s*(.+?);?$', line)
    if var_decl_match:
        var_type, var_name, value = var_decl_match.groups()
        converted_value = convert_expression(value)
        return f'{var_name} = {converted_value}'
    
    var_only_match = re.match(r'(\w+(?:<[^>]+>)?)\s+(\w+);?$', line)
    if var_only_match:
        var_type, var_name = var_only_match.groups()
        default_value = get_default_value(var_type)
        return f'{var_name} = {default_value}'
    
    line = convert_expression(line)
    
    if line.endswith(';'):
        line = line[:-1]
    
    return line

def convert_parameters(params: str) -> str:
    """Convert C++ function parameters to Python."""
    if not params.strip():
        return 'self'
    
    param_list = []
    param_list.append('self')
    
    params = params.strip()
    parts = split_parameters(params)
    
    for part in parts:
        part = part.strip()
        if not part:
            continue
        
        match = re.match(r'(?:const\s+)?(\w+(?:<[^>]+>)?)\s*[&*]?\s*(\w+)', part)
        if match:
            param_type, param_name = match.groups()
            type_hint = convert_type_to_python_hint(param_type)
            param_list.append(f'{param_name}: {type_hint}')
    
    return ', '.join(param_list)

def split_parameters(params: str) -> List[str]:
    """Split parameters by comma, respecting template brackets."""
    result = []
    current = []
    bracket_depth = 0
    
    for char in params:
        if char == '<':
            bracket_depth += 1
        elif char == '>':
            bracket_depth -= 1
        elif char == ',' and bracket_depth == 0:
            result.append(''.join(current))
            current = []
            continue
        current.append(char)
    
    if current:
        result.append(''.join(current))
    
    return result

def convert_type_to_python_hint(cpp_type: str) -> str:
    """Convert C++ type to Python type hint."""
    cpp_type = cpp_type.strip()
    
    type_map = {
        'int': 'int',
        'long': 'int',
        'long long': 'int',
        'float': 'float',
        'double': 'float',
        'bool': 'bool',
        'char': 'str',
        'string': 'str',
        'void': 'None',
    }
    
    if cpp_type in type_map:
        return type_map[cpp_type]
    
    vector_match = re.match(r'vector<(.+)>', cpp_type)
    if vector_match:
        inner_type = convert_type_to_python_hint(vector_match.group(1))
        return f'List[{inner_type}]'
    
    map_match = re.match(r'(?:unordered_)?map<([^,]+),\s*(.+)>', cpp_type)
    if map_match:
        key_type = convert_type_to_python_hint(map_match.group(1))
        val_type = convert_type_to_python_hint(map_match.group(2))
        return f'Dict[{key_type}, {val_type}]'
    
    set_match = re.match(r'(?:unordered_)?set<(.+)>', cpp_type)
    if set_match:
        inner_type = convert_type_to_python_hint(set_match.group(1))
        return f'Set[{inner_type}]'
    
    return 'Any'

def convert_condition(condition: str) -> str:
    """Convert C++ condition to Python."""
    condition = condition.strip()
    condition = re.sub(r'\b(\w+)\s*->\s*(\w+)', r'\1.\2', condition)
    condition = condition.replace('&&', ' and ')
    condition = condition.replace('||', ' or ')
    condition = condition.replace('!', ' not ')
    condition = re.sub(r'\bnot\s+not\b', '', condition)
    condition = condition.replace('NULL', 'None')
    condition = condition.replace('nullptr', 'None')
    condition = condition.replace('true', 'True')
    condition = condition.replace('false', 'False')
    
    return condition.strip()

def convert_expression(expr: str) -> str:
    """Convert C++ expression to Python."""
    expr = expr.strip()
    
    expr = re.sub(r'(\w+)\s*->\s*(\w+)', r'\1.\2', expr)
    
    expr = re.sub(r'\.push_back\((.*?)\)', r'.append(\1)', expr)
    expr = re.sub(r'\.size\(\)', r'len()', expr)
    expr = re.sub(r'\.empty\(\)', r'len() == 0', expr)
    expr = re.sub(r'\.clear\(\)', r'.clear()', expr)
    expr = re.sub(r'\.insert\((.*?)\)', r'.add(\1)', expr)
    expr = re.sub(r'\.erase\((.*?)\)', r'.remove(\1)', expr)
    expr = re.sub(r'\.find\((.*?)\)', r'.get(\1)', expr)
    expr = re.sub(r'\.substr\(', r'[', expr)
    
    expr = re.sub(r'\bnew\s+(\w+(?:<[^>]+>)?)\s*\((.*?)\)', r'\1(\2)', expr)
    
    expr = re.sub(r'vector<([^>]+)>\s*\(([^)]+)\)', lambda m: f'[0] * {m.group(2)}', expr)
    expr = re.sub(r'vector<([^>]+)>\s*\(\)', r'[]', expr)
    expr = re.sub(r'unordered_map<[^>]+>\s*\(\)', r'{}', expr)
    expr = re.sub(r'map<[^>]+>\s*\(\)', r'{}', expr)
    expr = re.sub(r'unordered_set<[^>]+>\s*\(\)', r'set()', expr)
    expr = re.sub(r'set<[^>]+>\s*\(\)', r'set()', expr)
    
    expr = expr.replace('&&', ' and ')
    expr = expr.replace('||', ' or ')
    expr = expr.replace('!', ' not ')
    expr = expr.replace('NULL', 'None')
    expr = expr.replace('nullptr', 'None')
    expr = expr.replace('true', 'True')
    expr = expr.replace('false', 'False')
    
    if expr.endswith(';'):
        expr = expr[:-1]
    
    return expr.strip()

def get_default_value(cpp_type: str) -> str:
    """Get default value for a C++ type."""
    cpp_type = cpp_type.strip()
    
    if cpp_type in ['int', 'long', 'long long', 'float', 'double']:
        return '0'
    elif cpp_type == 'bool':
        return 'False'
    elif cpp_type in ['char', 'string']:
        return '""'
    elif cpp_type.startswith('vector'):
        return '[]'
    elif 'map' in cpp_type:
        return '{}'
    elif 'set' in cpp_type:
        return 'set()'
    else:
        return 'None'

def cleanup_code(code: str) -> str:
    """Clean up the converted Python code."""
    lines = code.split('\n')
    cleaned = []
    
    for line in lines:
        if line.strip() and line.strip() not in ['{', '}', '};', 'public:', 'private:', 'protected:']:
            cleaned.append(line)
    
    result = '\n'.join(cleaned)
    result = re.sub(r'\n\s*\n\s*\n+', '\n\n', result)
    
    return result
