import AsyncSelect from 'react-select/async';
import axios from 'axios';

interface BaseSelectAsyncProps {
    label: string;
    endpoint: string;
    placeholder?: string;
    onChange?: (value: any) => void;
    mapResponse: (data: any) => { value: any; label: string }[];
}

const Select2Async = ({ label, endpoint, placeholder, onChange, mapResponse }: BaseSelectAsyncProps) => {

    // Fungsi utama untuk mengambil data
    const loadOptions = async (inputValue: string) => {
        try {
            const token = localStorage.getItem('token-mabar');
            const response = await axios.get(endpoint, {
                params: { search: inputValue },
                headers: {
                    'Content-Type': 'application/json',
                    'token-mabar': token || ''
                }
            });

            // LANGSUNG RETURN hasil dari mapResponse agar AsyncSelect bisa merendernya
            return mapResponse(response.data);
        } catch (error) {
            console.error(`Error requesting data from ${endpoint}:`, error);
            return [];
        }
    };

    return (
        <div className="w-full space-y-2 mb-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                {label}
            </label>

            <AsyncSelect
                cacheOptions
                // defaultOptions={true} akan memanggil loadOptions("") otomatis saat komponen dimuat
                defaultOptions={true}
                loadOptions={loadOptions}
                onChange={onChange}
                placeholder={placeholder || "Cari..."}
                isSearchable={true}
                openMenuOnFocus={true}
                classNames={{
                    // Meniru: w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white
                    control: (state) =>
                        `!w-full !min-h-[42px] !bg-slate-950 !border !border-white/10 !rounded-xl !text-xs !text-white !outline-none !transition-all !shadow-none
                        ${state.isFocused ? '!ring-1 !ring-blue-500 !border-blue-500/50' : ''}`,

                    // ValueContainer adalah tempat text placeholder/terpilih
                    // Kita samakan px-4 agar teks sejajar dengan input lainnya
                    valueContainer: () => "!px-4 !p-0 !flex !items-center",

                    // Input pencarian internal
                    input: () => "!text-white !m-0 !p-0 !text-xs",

                    // Teks yang sudah dipilih
                    singleValue: () => "!text-white !m-0",

                    placeholder: () => "!text-slate-700 !m-0",

                    // Panel Dropdown
                    menu: () => "!bg-slate-950 !border !border-white/10 !mt-2 !rounded-xl !overflow-hidden !z-50 !shadow-2xl",

                    // Item List
                    option: (state) =>
                        `!text-xs !cursor-pointer !px-4 !py-3 !transition-colors
                        ${state.isSelected ? '!bg-blue-600 !text-white' : state.isFocused ? '!bg-white/5 !text-white' : '!bg-transparent !text-white/80'}`,

                    // Indikator Icon Caret (Menyamakan UI Select Standar)
                    indicatorsContainer: () => "!pe-2",
                    dropdownIndicator: (state) =>
                        `!text-slate-500 !p-1 !transition-transform ${state.selectProps.menuIsOpen ? 'rotate-180' : ''}`,
                    indicatorSeparator: () => "!hidden", // Wajib sembunyikan separator

                    loadingMessage: () => "!text-blue-400 !py-3 !text-[10px]",
                    noOptionsMessage: () => "!text-slate-500 !py-3 !text-[10px]",
                }}
                unstyled
            />
        </div>
    );
};

export default Select2Async;